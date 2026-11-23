import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentAggregateStatus,
  PaymentMethod,
  PaymentTransactionStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import { InventoryReservationService } from '../orders/inventory-reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { VnpayGateway } from './vnpay.gateway';
import { requestUser } from '../../../test/helpers/request-user';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const aggregateId = '10000000-0000-4000-8000-000000000001';
const transactionId = '20000000-0000-4000-8000-000000000001';
const orderId = '30000000-0000-4000-8000-000000000001';
const owner = {
  ...requestUser(),
  id: '40000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  role: RoleName.VISITOR,
};

function pendingTransaction() {
  return {
    id: transactionId,
    paymentAggregateId: aggregateId,
    txnRef: 'txn-ref',
    amount: new Prisma.Decimal('12345'),
    receivedAmount: null,
    currency: 'VND',
    status: PaymentTransactionStatus.PENDING,
    paymentUrl: 'https://sandbox.example/pay',
    gatewayCreateDate: '20260821080000',
    gatewayTxNo: null,
    responseCode: null,
    transactionStatus: null,
    rawIpnPayload: null,
    expiresAt: new Date(Date.now() + 60_000),
    processedAt: null,
    lastQueriedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function serviceFixture() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    paymentTransaction: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentAggregate: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      findMany: jest.fn().mockResolvedValue([{ id: orderId }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderTracking: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refundAttempt: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    paymentTransaction: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentAggregate: {
      findUnique: jest.fn(),
    },
    paymentQueryAttempt: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const gateway = {
    verifyCallback: jest.fn(),
    sanitizePayload: jest.fn((value: Record<string, unknown>) => value),
  };
  const inventory = {
    isAggregateRecoverable: jest.fn().mockResolvedValue(true),
    releaseAggregate: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'VNPAY_TMN_CODE' ? 'TESTCODE' : fallback,
    ),
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    gateway as unknown as VnpayGateway,
    inventory as unknown as InventoryReservationService,
  );
  return { service, prisma, tx, gateway, inventory };
}

describe('PaymentsService', () => {
  it('does not touch persistence when Return URL signature is invalid', async () => {
    const { service, prisma, gateway } = serviceFixture();
    gateway.verifyCallback.mockReturnValue({ valid: false, params: {} });

    await expect(
      service.verifyReturn({ vnp_TxnRef: 'txn-ref' }),
    ).resolves.toEqual(
      expect.objectContaining({ signatureValid: false, success: false }),
    );
    expect(prisma.paymentTransaction.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats Return URL as display-only and trusts local payment state', async () => {
    const { service, prisma, gateway } = serviceFixture();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TxnRef: 'txn-ref',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      txnRef: 'txn-ref',
      status: PaymentTransactionStatus.PENDING,
      paymentAggregate: { status: PaymentAggregateStatus.PENDING },
    });

    const result = await service.verifyReturn({});

    expect(result.gatewayReportedSuccess).toBe(true);
    expect(result.success).toBe(false);
    expect(result.paymentStatus).toBe(PaymentTransactionStatus.PENDING);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an IPN with an invalid signature before database access', async () => {
    const { service, prisma, gateway } = serviceFixture();
    gateway.verifyCallback.mockReturnValue({ valid: false, params: {} });

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '97',
      Message: 'Invalid signature',
    });
    expect(prisma.paymentTransaction.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an authentic IPN when the amount differs from server state', async () => {
    const { service, prisma, gateway } = serviceFixture();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: 'txn-ref',
        vnp_Amount: '9999900',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue(
      pendingTransaction(),
    );

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '04',
      Message: 'Invalid amount',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an IPN currency that differs from the persisted VND currency', async () => {
    const { service, prisma, gateway } = serviceFixture();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: 'txn-ref',
        vnp_CurrCode: 'USD',
        vnp_Amount: '1234500',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue(
      pendingTransaction(),
    );

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '04',
      Message: 'Invalid currency',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 02 for a replay of an already completed successful IPN', async () => {
    const { service, prisma, gateway } = serviceFixture();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: 'txn-ref',
        vnp_Amount: '1234500',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      ...pendingTransaction(),
      status: PaymentTransactionStatus.COMPLETED,
    });

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '02',
      Message: 'Transaction already confirmed',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks an unverifiable late-success IPN for reconciliation', async () => {
    const { service, prisma, tx, gateway } = serviceFixture();
    const expired = {
      ...pendingTransaction(),
      status: PaymentTransactionStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 60_000),
    };
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: 'txn-ref',
        vnp_Amount: '1234500',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: 'gateway-transaction',
      },
    });
    prisma.paymentTransaction.findUnique
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce({ paymentAggregateId: aggregateId });
    tx.paymentTransaction.findUnique.mockResolvedValue(expired);
    tx.paymentAggregate.findUnique.mockResolvedValue({
      status: PaymentAggregateStatus.PENDING,
    });
    jest.spyOn(service, 'reconcileTransaction').mockResolvedValue('UNKNOWN');

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '99',
      Message: 'Reconciliation required',
    });
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
        }),
      }),
    );
    expect(tx.paymentAggregate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentAggregateStatus.RECONCILIATION_REQUIRED,
        }),
      }),
    );
  });

  it('atomically completes payment and confirms every recoverable order', async () => {
    const { service, prisma, tx, gateway, inventory } = serviceFixture();
    const transaction = pendingTransaction();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: transaction.txnRef,
        vnp_Amount: '1234500',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: 'gateway-transaction',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue(transaction);
    tx.paymentTransaction.findUnique.mockResolvedValue({
      ...transaction,
      paymentAggregate: { id: aggregateId },
    });
    tx.paymentTransaction.findUniqueOrThrow.mockResolvedValue(transaction);

    await expect(
      service.verifyIpn({ vnp_SecureHash: 'removed' }),
    ).resolves.toEqual({ RspCode: '00', Message: 'Confirm Success' });

    expect(inventory.isAggregateRecoverable).toHaveBeenCalled();
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: transactionId },
        data: expect.objectContaining({
          status: PaymentTransactionStatus.COMPLETED,
          gatewayTxNo: 'gateway-transaction',
        }),
      }),
    );
    expect(tx.paymentAggregate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentAggregateStatus.COMPLETED,
        }),
      }),
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        paymentAggregateId: aggregateId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.CONFIRMED,
        paymentStatus: 'COMPLETED',
      },
    });
    expect(tx.orderTracking.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId,
          status: OrderStatus.CONFIRMED,
        }),
      ],
    });
  });

  it('requires both VNPay response and transaction status to be successful', async () => {
    const { service, prisma, tx, gateway, inventory } = serviceFixture();
    const transaction = pendingTransaction();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: transaction.txnRef,
        vnp_Amount: '1234500',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '02',
        vnp_TransactionNo: 'gateway-transaction',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue(transaction);
    tx.paymentTransaction.findUnique.mockResolvedValue({
      ...transaction,
      paymentAggregate: { id: aggregateId },
    });

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '00',
      Message: 'Failure recorded',
    });
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentTransactionStatus.FAILED,
        }),
      }),
    );
    expect(inventory.isAggregateRecoverable).not.toHaveBeenCalled();
  });

  it('does not persist a duplicate gateway transaction number on a failure IPN', async () => {
    const { service, prisma, tx, gateway } = serviceFixture();
    const transaction = pendingTransaction();
    gateway.verifyCallback.mockReturnValue({
      valid: true,
      params: {
        vnp_TmnCode: 'TESTCODE',
        vnp_TxnRef: transaction.txnRef,
        vnp_Amount: '1234500',
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '02',
        vnp_TransactionNo: 'duplicate-gateway-transaction',
      },
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue(transaction);
    tx.paymentTransaction.findUnique.mockResolvedValue({
      ...transaction,
      paymentAggregate: { id: aggregateId },
    });
    tx.paymentTransaction.findFirst.mockResolvedValue({ id: 'another-tx' });

    await expect(service.verifyIpn({})).resolves.toEqual({
      RspCode: '99',
      Message: 'Duplicate gateway transaction',
    });
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
        }),
      }),
    );
  });

  it('never releases paid orders when reconciling an older unpaid attempt', async () => {
    const { service, prisma, tx, inventory } = serviceFixture();
    const oldAttempt = {
      ...pendingTransaction(),
      status: PaymentTransactionStatus.FAILED,
    };
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      paymentAggregateId: aggregateId,
    });
    tx.paymentTransaction.findUniqueOrThrow.mockResolvedValue(oldAttempt);
    tx.paymentAggregate.findUnique.mockResolvedValue({
      status: PaymentAggregateStatus.COMPLETED,
    });
    const internal = service as unknown as {
      markUnpaidTransaction(id: string, release: boolean): Promise<void>;
    };

    await internal.markUnpaidTransaction(transactionId, true);

    expect(inventory.releaseAggregate).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.paymentAggregate.update).not.toHaveBeenCalled();
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentTransactionStatus.EXPIRED,
        }),
      }),
    );
  });

  it('prevents one user from reading another checkout status', async () => {
    const { service, prisma } = serviceFixture();
    prisma.paymentAggregate.findUnique.mockResolvedValue({
      id: aggregateId,
      userId: 'another-user',
      status: PaymentAggregateStatus.PENDING,
      amount: new Prisma.Decimal(12345),
      currency: 'VND',
      paymentMethod: PaymentMethod.VNPAY,
      reconciliationReason: null,
      orders: [],
      transactions: [],
    });

    await expect(
      service.getAggregateStatus(aggregateId, owner),
    ).rejects.toThrow(ForbiddenException);
  });
});
