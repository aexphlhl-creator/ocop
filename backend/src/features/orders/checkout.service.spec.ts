import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentAggregateStatus,
  PaymentMethod,
  Prisma,
  RoleName,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayGateway } from '../payments/vnpay.gateway';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutService } from './checkout.service';

const productA = '10000000-0000-4000-8000-000000000001';
const productB = '10000000-0000-4000-8000-000000000002';
const sellerId = '20000000-0000-4000-8000-000000000001';
const aggregateId = '30000000-0000-4000-8000-000000000001';
const idempotencyKey = '40000000-0000-4000-8000-000000000001';
const user = {
  id: '50000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  role: RoleName.VISITOR,
  fullName: 'Test Buyer',
  phone: null,
  isActive: true,
  mustChangePassword: false,
  createdAt: new Date('2026-01-01'),
};

function dto(overrides: Partial<CheckoutDto> = {}): CheckoutDto {
  return {
    idempotencyKey,
    shippingAddress: '123 Đường OCOP',
    phone: '0912345678',
    paymentMethod: PaymentMethod.COD,
    items: [
      { productId: productA, quantity: 1 },
      { productId: productB, quantity: 2 },
    ],
    ...overrides,
  };
}

function aggregate(requestHash: string) {
  return {
    id: aggregateId,
    userId: user.id,
    idempotencyKey,
    requestHash,
    amount: new Prisma.Decimal('25000'),
    currency: 'VND',
    status: PaymentAggregateStatus.PENDING,
    paymentMethod: PaymentMethod.COD,
    orders: [
      {
        id: '60000000-0000-4000-8000-000000000001',
        sellerId,
        totalAmount: new Prisma.Decimal('25000'),
        status: 'PENDING',
        paymentStatus: 'PENDING',
      },
    ],
    transactions: [],
  };
}

function fixture() {
  const tx = {
    paymentAggregate: {
      findUnique: jest.fn(),
    },
  };
  const prisma = {
    paymentAggregate: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const gateway = {
    buildPaymentUrl: jest.fn(),
  };
  const config = { get: jest.fn() };
  const service = new CheckoutService(
    prisma as unknown as PrismaService,
    gateway as unknown as VnpayGateway,
    config as unknown as ConfigService,
  );
  return { service, prisma, tx, gateway };
}

function normalizedAndHash(service: CheckoutService, input: CheckoutDto) {
  const internals = service as unknown as {
    normalizeRequest(value: CheckoutDto): unknown;
    hashRequest(value: unknown): string;
  };
  const normalized = internals.normalizeRequest(input);
  return { normalized, hash: internals.hashRequest(normalized) };
}

describe('CheckoutService idempotency', () => {
  it('canonicalizes item order, duplicates, whitespace and voucher case', () => {
    const { service } = fixture();
    const left = normalizedAndHash(
      service,
      dto({
        shippingAddress: '  123   Đường OCOP ',
        phone: '0912 345 678',
        items: [
          { productId: productB, quantity: 2 },
          { productId: productA, quantity: 1 },
          { productId: productA.toUpperCase(), quantity: 2 },
        ],
        platformVoucherCode: ' sale10 ',
        shopVouchers: [{ sellerId, code: ' shop5 ' }],
      }),
    );
    const right = normalizedAndHash(
      service,
      dto({
        items: [
          { productId: productA, quantity: 3 },
          { productId: productB, quantity: 2 },
        ],
        platformVoucherCode: 'SALE10',
        shopVouchers: [{ sellerId, code: 'SHOP5' }],
      }),
    );

    expect(left.normalized).toEqual(right.normalized);
    expect(left.hash).toBe(right.hash);
  });

  it('returns the original aggregate for an identical repeated request', async () => {
    const { service, tx, gateway } = fixture();
    const input = dto();
    const { hash } = normalizedAndHash(service, input);
    tx.paymentAggregate.findUnique.mockResolvedValue(aggregate(hash));

    const result = await service.checkout(input, user, '127.0.0.1');

    expect(result).toEqual(
      expect.objectContaining({
        aggregateId,
        amount: '25000.00',
        paymentMethod: PaymentMethod.COD,
      }),
    );
    expect(gateway.buildPaymentUrl).not.toHaveBeenCalled();
  });

  it('rejects reuse of one idempotency key for a different intent', async () => {
    const { service, tx } = fixture();
    tx.paymentAggregate.findUnique.mockResolvedValue(aggregate('a'.repeat(64)));

    await expect(service.checkout(dto(), user, '127.0.0.1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('loads the winning checkout after a concurrent unique-key race', async () => {
    const { service, prisma } = fixture();
    const input = dto();
    const { hash } = normalizedAndHash(service, input);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['user_id', 'idempotency_key'] },
      }),
    );
    prisma.paymentAggregate.findUnique.mockResolvedValue(aggregate(hash));

    const result = await service.checkout(input, user, '127.0.0.1');

    expect(result.aggregateId).toBe(aggregateId);
    expect(prisma.paymentAggregate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
      }),
    );
  });
});
