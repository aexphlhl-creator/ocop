import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscountType,
  PaymentMethod,
  PaymentProvider,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { VnpayGateway } from '../payments/vnpay.gateway';
import { CheckoutDto } from './dto/checkout.dto';

type TransactionClient = Prisma.TransactionClient;

interface VoucherRow {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_value: number;
  max_discount: number | null;
  start_date: Date;
  end_date: Date;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  seller_id: string | null;
}

interface LockedBatchRow {
  id: string;
  inventory_id: string;
  quantity: number;
  expiry_date: Date | null;
  received_date: Date;
}

interface ReservationSumRow {
  batch_id: string;
  reserved: bigint | number;
}

interface CheckoutProduct {
  id: string;
  name: string;
  sellerId: string;
  price: Prisma.Decimal;
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpay: VnpayGateway,
    private readonly config: ConfigService,
  ) {}

  async checkout(dto: CheckoutDto, user: RequestUser, ipAddress = '127.0.0.1') {
    const normalized = this.normalizeRequest(dto);
    const requestHash = this.hashRequest(normalized);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) =>
            this.createCheckout(
              tx,
              dto,
              normalized,
              requestHash,
              user,
              ipAddress,
            ),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 20000,
          },
        );
      } catch (error) {
        if (this.isIdempotencyUniqueViolation(error)) {
          return this.loadIdempotentResult(
            user.id,
            dto.idempotencyKey,
            requestHash,
          );
        }
        if (this.isRetryableTransactionError(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      'Không thể hoàn tất checkout, vui lòng thử lại',
    );
  }

  private async createCheckout(
    tx: TransactionClient,
    dto: CheckoutDto,
    normalized: ReturnType<CheckoutService['normalizeRequest']>,
    requestHash: string,
    user: RequestUser,
    ipAddress: string,
  ) {
    const existing = await tx.paymentAggregate.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: user.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: this.aggregateInclude(),
    });
    if (existing) {
      this.assertMatchingHash(existing.requestHash, requestHash);
      return this.toCheckoutResponse(existing);
    }

    const products = await tx.product.findMany({
      where: {
        id: { in: normalized.items.map((item) => item.productId) },
        status: ProductStatus.APPROVED,
        deletedAt: null,
        seller: { isActive: true, sellerProfile: { isVerified: true } },
      },
      select: {
        id: true,
        name: true,
        price: true,
        sellerId: true,
      },
    });
    if (products.length !== normalized.items.length) {
      const found = new Set(products.map((product) => product.id));
      const missing = normalized.items
        .filter((item) => !found.has(item.productId))
        .map((item) => item.productId);
      throw new NotFoundException(
        `Sản phẩm không tồn tại hoặc chưa được duyệt: ${missing.join(', ')}`,
      );
    }

    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const sellerSubtotals = new Map<string, Prisma.Decimal>();
    for (const item of normalized.items) {
      const product = productById.get(item.productId)!;
      const lineTotal = product.price.mul(item.quantity);
      sellerSubtotals.set(
        product.sellerId,
        (sellerSubtotals.get(product.sellerId) ?? new Prisma.Decimal(0)).add(
          lineTotal,
        ),
      );
    }

    const vouchers = await this.lockAndLoadVouchers(tx, normalized);
    const pricing = this.calculateDiscounts(
      sellerSubtotals,
      vouchers,
      normalized,
    );
    const aggregateAmount = Array.from(pricing.values()).reduce(
      (total, price) => total.add(price.finalAmount),
      new Prisma.Decimal(0),
    );
    if (dto.paymentMethod === PaymentMethod.VNPAY && aggregateAmount.lt(5000)) {
      throw new BadRequestException(
        'VNPay yêu cầu giá trị thanh toán tối thiểu 5.000 VND',
      );
    }

    const aggregate = await tx.paymentAggregate.create({
      data: {
        userId: user.id,
        idempotencyKey: dto.idempotencyKey,
        requestHash,
        amount: aggregateAmount,
        currency: 'VND',
        paymentMethod: dto.paymentMethod,
        provider:
          dto.paymentMethod === PaymentMethod.VNPAY
            ? PaymentProvider.VNPAY
            : PaymentProvider.NONE,
      },
    });

    const orderItemsByProduct = new Map<
      string,
      { id: string; quantity: number; product: CheckoutProduct }
    >();
    const sortedSellerIds = Array.from(sellerSubtotals.keys()).sort();
    for (const sellerId of sortedSellerIds) {
      const groupItems = normalized.items.filter(
        (item) => productById.get(item.productId)!.sellerId === sellerId,
      );
      const price = pricing.get(sellerId)!;
      const order = await tx.order.create({
        data: {
          userId: user.id,
          sellerId,
          paymentAggregateId: aggregate.id,
          totalAmount: price.finalAmount,
          discountAmount: price.totalDiscount,
          shippingAddress: normalized.shippingAddress,
          phone: normalized.phone,
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'PENDING',
          note: normalized.note || null,
          platformVoucherId: vouchers.platform?.id ?? null,
          shopVoucherId: vouchers.shopBySeller.get(sellerId)?.id ?? null,
          items: {
            create: groupItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: productById.get(item.productId)!.price,
            })),
          },
          tracking: {
            create: {
              status: 'PENDING',
              description: 'Đơn hàng được tạo từ checkout bảo mật',
              changedById: user.id,
              ipAddress,
            },
          },
        },
        include: { items: true },
      });
      for (const item of order.items) {
        orderItemsByProduct.set(item.productId, {
          id: item.id,
          quantity: item.quantity,
          product: productById.get(item.productId)!,
        });
      }
    }

    await this.reserveInventory(tx, orderItemsByProduct);
    await this.consumeVouchers(tx, vouchers);

    if (dto.paymentMethod === PaymentMethod.VNPAY) {
      const now = new Date();
      const timeoutMinutes = this.config.get<number>(
        'VNPAY_PAYMENT_TIMEOUT_MINUTES',
        15,
      );
      const expiresAt = new Date(now.getTime() + timeoutMinutes * 60_000);
      const txnRef = randomUUID().replace(/-/g, '');
      const payment = this.vnpay.buildPaymentUrl({
        txnRef,
        amount: aggregateAmount,
        ipAddress,
        createDate: now,
        expiresAt,
      });
      await tx.paymentTransaction.create({
        data: {
          paymentAggregateId: aggregate.id,
          txnRef,
          amount: aggregateAmount,
          currency: 'VND',
          paymentUrl: payment.paymentUrl,
          gatewayCreateDate: payment.gatewayCreateDate,
          expiresAt,
        },
      });
    }

    const created = await tx.paymentAggregate.findUniqueOrThrow({
      where: { id: aggregate.id },
      include: this.aggregateInclude(),
    });
    return this.toCheckoutResponse(created);
  }

  private async reserveInventory(
    tx: TransactionClient,
    orderItemsByProduct: Map<
      string,
      { id: string; quantity: number; product: CheckoutProduct }
    >,
  ) {
    const productIds = Array.from(orderItemsByProduct.keys()).sort();
    const inventoryRows = await tx.inventory.findMany({
      where: {
        productId: { in: productIds },
        warehouse: { isActive: true },
      },
      select: {
        id: true,
        productId: true,
        warehouse: { select: { sellerId: true } },
      },
      orderBy: { id: 'asc' },
    });
    const inventoryIds = inventoryRows.map((inventory) => inventory.id).sort();
    if (inventoryIds.length > 0) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "inventories"
          WHERE "id" IN (${Prisma.join(inventoryIds)})
          ORDER BY "id" FOR UPDATE`,
      );
    }

    for (const productId of productIds) {
      const item = orderItemsByProduct.get(productId)!;
      const matchingInventories = inventoryRows
        .filter(
          (inventory) =>
            inventory.productId === productId &&
            inventory.warehouse.sellerId === item.product.sellerId,
        )
        .map((inventory) => inventory.id)
        .sort();
      if (matchingInventories.length === 0) {
        throw new BadRequestException(
          `Sản phẩm "${item.product.name}" chưa có tồn kho khả dụng`,
        );
      }

      const batches = await tx.$queryRaw<LockedBatchRow[]>(
        Prisma.sql`SELECT "id", "inventory_id", "quantity", "expiry_date", "received_date"
          FROM "inventory_batches"
          WHERE "inventory_id" IN (${Prisma.join(matchingInventories)})
            AND "status" = 'ACTIVE'
            AND "quality_status" = 'PASSED'
            AND "lifecycle_status" = 'RELEASED'
            AND ("expiry_date" > CURRENT_TIMESTAMP OR "expiry_date" IS NULL)
          ORDER BY "expiry_date" ASC NULLS LAST, "received_date" ASC, "id" ASC
          FOR UPDATE`,
      );
      if (batches.length === 0) {
        throw new BadRequestException(
          `Sản phẩm "${item.product.name}" không có lô đạt chất lượng`,
        );
      }

      const sums = await tx.$queryRaw<ReservationSumRow[]>(
        Prisma.sql`SELECT "batch_id", COALESCE(SUM("quantity"), 0) AS "reserved"
          FROM "order_item_batch_reservations"
          WHERE "batch_id" IN (${Prisma.join(batches.map((batch) => batch.id))})
            AND "status" = 'ACTIVE'
          GROUP BY "batch_id"`,
      );
      const reservedByBatch = new Map(
        sums.map((sum) => [sum.batch_id, Number(sum.reserved)]),
      );
      const reservedByInventory = new Map<string, number>();
      let remaining = item.quantity;
      for (const batch of batches) {
        if (remaining === 0) break;
        const available = Math.max(
          0,
          batch.quantity - (reservedByBatch.get(batch.id) ?? 0),
        );
        if (available === 0) continue;
        const allocated = Math.min(available, remaining);
        await tx.orderItemBatchReservation.create({
          data: {
            orderItemId: item.id,
            batchId: batch.id,
            quantity: allocated,
          },
        });
        reservedByInventory.set(
          batch.inventory_id,
          (reservedByInventory.get(batch.inventory_id) ?? 0) + allocated,
        );
        remaining -= allocated;
      }
      if (remaining > 0) {
        throw new BadRequestException(
          `Sản phẩm "${item.product.name}" không đủ tồn kho. Thiếu ${remaining}`,
        );
      }
      for (const [inventoryId, quantity] of Array.from(
        reservedByInventory.entries(),
      ).sort(([left], [right]) => left.localeCompare(right))) {
        await tx.inventory.update({
          where: { id: inventoryId },
          data: { reservedQuantity: { increment: quantity } },
        });
      }
    }
  }

  private async lockAndLoadVouchers(
    tx: TransactionClient,
    normalized: ReturnType<CheckoutService['normalizeRequest']>,
  ) {
    const codes = [
      normalized.platformVoucherCode,
      ...normalized.shopVouchers.map((voucher) => voucher.code),
    ].filter((code): code is string => Boolean(code));
    const uniqueCodes = Array.from(new Set(codes)).sort();
    if (uniqueCodes.length !== codes.length) {
      throw new BadRequestException('Một voucher không thể áp dụng nhiều lần');
    }
    if (uniqueCodes.length === 0) {
      return {
        platform: null as VoucherRow | null,
        shopBySeller: new Map<string, VoucherRow>(),
      };
    }
    const rows = await tx.$queryRaw<VoucherRow[]>(
      Prisma.sql`SELECT "id", "code", "discount_type", "discount_value",
        "min_order_value", "max_discount", "start_date", "end_date",
        "usage_limit", "used_count", "is_active", "seller_id"
        FROM "vouchers"
        WHERE "code" IN (${Prisma.join(uniqueCodes)})
        ORDER BY "id" FOR UPDATE`,
    );
    if (rows.length !== uniqueCodes.length) {
      throw new NotFoundException('Một hoặc nhiều mã giảm giá không tồn tại');
    }
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const platform = normalized.platformVoucherCode
      ? byCode.get(normalized.platformVoucherCode)!
      : null;
    if (platform?.seller_id) {
      throw new BadRequestException('Mã giảm giá sàn không hợp lệ');
    }
    const shopBySeller = new Map<string, VoucherRow>();
    for (const requested of normalized.shopVouchers) {
      const voucher = byCode.get(requested.code)!;
      if (voucher.seller_id !== requested.sellerId) {
        throw new BadRequestException(
          `Voucher ${voucher.code} không thuộc gian hàng đã chọn`,
        );
      }
      if (shopBySeller.has(requested.sellerId)) {
        throw new BadRequestException(
          'Mỗi gian hàng chỉ được áp dụng một voucher',
        );
      }
      shopBySeller.set(requested.sellerId, voucher);
    }
    return { platform, shopBySeller };
  }

  private calculateDiscounts(
    subtotals: Map<string, Prisma.Decimal>,
    vouchers: {
      platform: VoucherRow | null;
      shopBySeller: Map<string, VoucherRow>;
    },
    normalized: ReturnType<CheckoutService['normalizeRequest']>,
  ) {
    const now = new Date();
    const afterShop = new Map<
      string,
      { subtotal: Prisma.Decimal; shopDiscount: Prisma.Decimal }
    >();
    for (const sellerId of Array.from(subtotals.keys()).sort()) {
      const subtotal = subtotals.get(sellerId)!;
      const shopVoucher = vouchers.shopBySeller.get(sellerId);
      const shopDiscount = shopVoucher
        ? this.validateAndCalculateVoucher(shopVoucher, subtotal, now, sellerId)
        : new Prisma.Decimal(0);
      afterShop.set(sellerId, { subtotal, shopDiscount });
    }
    for (const requested of normalized.shopVouchers) {
      if (!subtotals.has(requested.sellerId)) {
        throw new BadRequestException(
          'Voucher shop không tương ứng với sản phẩm trong giỏ hàng',
        );
      }
    }

    const platformBase = Array.from(afterShop.values()).reduce(
      (total, value) => total.add(value.subtotal.sub(value.shopDiscount)),
      new Prisma.Decimal(0),
    );
    const platformDiscount = vouchers.platform
      ? this.validateAndCalculateVoucher(
          vouchers.platform,
          platformBase,
          now,
          null,
        )
      : new Prisma.Decimal(0);

    const result = new Map<
      string,
      {
        finalAmount: Prisma.Decimal;
        totalDiscount: Prisma.Decimal;
      }
    >();
    let allocatedPlatform = new Prisma.Decimal(0);
    const sellerIds = Array.from(afterShop.keys()).sort();
    for (let index = 0; index < sellerIds.length; index += 1) {
      const sellerId = sellerIds[index];
      const current = afterShop.get(sellerId)!;
      const net = current.subtotal.sub(current.shopDiscount);
      const isLast = index === sellerIds.length - 1;
      const platformShare =
        platformDiscount.eq(0) || platformBase.eq(0)
          ? new Prisma.Decimal(0)
          : isLast
            ? platformDiscount.sub(allocatedPlatform)
            : platformDiscount
                .mul(net)
                .div(platformBase)
                .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      allocatedPlatform = allocatedPlatform.add(platformShare);
      const totalDiscount = current.shopDiscount.add(platformShare);
      result.set(sellerId, {
        finalAmount: current.subtotal.sub(totalDiscount),
        totalDiscount,
      });
    }
    return result;
  }

  private validateAndCalculateVoucher(
    voucher: VoucherRow,
    orderValue: Prisma.Decimal,
    now: Date,
    expectedSellerId: string | null,
  ) {
    if (!voucher.is_active) {
      throw new BadRequestException(`Voucher ${voucher.code} đã bị khóa`);
    }
    if (now < voucher.start_date || now > voucher.end_date) {
      throw new BadRequestException(`Voucher ${voucher.code} chưa có hiệu lực`);
    }
    if (
      voucher.usage_limit !== null &&
      voucher.used_count >= voucher.usage_limit
    ) {
      throw new BadRequestException(`Voucher ${voucher.code} đã hết lượt dùng`);
    }
    if (voucher.seller_id !== expectedSellerId) {
      throw new BadRequestException(
        `Voucher ${voucher.code} sai phạm vi áp dụng`,
      );
    }
    if (orderValue.lt(voucher.min_order_value)) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu của voucher ${voucher.code}`,
      );
    }
    const rawDiscount =
      voucher.discount_type === DiscountType.FIXED_AMOUNT
        ? new Prisma.Decimal(voucher.discount_value)
        : orderValue.mul(voucher.discount_value).div(100);
    const capped =
      voucher.max_discount !== null && rawDiscount.gt(voucher.max_discount)
        ? new Prisma.Decimal(voucher.max_discount)
        : rawDiscount;
    return Prisma.Decimal.min(capped, orderValue).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_DOWN,
    );
  }

  private async consumeVouchers(
    tx: TransactionClient,
    vouchers: {
      platform: VoucherRow | null;
      shopBySeller: Map<string, VoucherRow>;
    },
  ) {
    const ids = [
      vouchers.platform?.id,
      ...Array.from(vouchers.shopBySeller.values()).map(
        (voucher) => voucher.id,
      ),
    ].filter((id): id is string => Boolean(id));
    for (const id of ids.sort()) {
      await tx.voucher.update({
        where: { id },
        data: { usedCount: { increment: 1 } },
      });
    }
  }

  private normalizeRequest(dto: CheckoutDto) {
    const combined = new Map<string, number>();
    for (const item of dto.items) {
      combined.set(
        item.productId.toLowerCase(),
        (combined.get(item.productId.toLowerCase()) ?? 0) + item.quantity,
      );
    }
    return {
      shippingAddress: dto.shippingAddress.trim().replace(/\s+/g, ' '),
      phone: dto.phone.trim().replace(/\s+/g, ''),
      paymentMethod: dto.paymentMethod,
      items: Array.from(combined.entries())
        .map(([productId, quantity]) => ({ productId, quantity }))
        .sort((left, right) => left.productId.localeCompare(right.productId)),
      platformVoucherCode:
        dto.platformVoucherCode?.trim().toUpperCase() || null,
      shopVouchers: (dto.shopVouchers ?? [])
        .map((voucher) => ({
          sellerId: voucher.sellerId.toLowerCase(),
          code: voucher.code.trim().toUpperCase(),
        }))
        .sort((left, right) =>
          `${left.sellerId}:${left.code}`.localeCompare(
            `${right.sellerId}:${right.code}`,
          ),
        ),
      note: dto.note?.trim().replace(/\s+/g, ' ') || '',
    };
  }

  private hashRequest(
    normalized: ReturnType<CheckoutService['normalizeRequest']>,
  ) {
    return createHash('sha256')
      .update(JSON.stringify(normalized), 'utf8')
      .digest('hex');
  }

  private async loadIdempotentResult(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    const aggregate = await this.prisma.paymentAggregate.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: this.aggregateInclude(),
    });
    if (!aggregate) {
      throw new ConflictException(
        'Checkout đồng thời chưa hoàn tất, vui lòng gửi lại cùng idempotency key',
      );
    }
    this.assertMatchingHash(aggregate.requestHash, requestHash);
    return this.toCheckoutResponse(aggregate);
  }

  private assertMatchingHash(savedHash: string, incomingHash: string) {
    if (savedHash !== incomingHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key đã được dùng cho nội dung checkout khác',
      });
    }
  }

  private aggregateInclude() {
    return {
      orders: {
        orderBy: { sellerId: 'asc' as const },
        select: {
          id: true,
          sellerId: true,
          totalAmount: true,
          status: true,
          paymentStatus: true,
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          txnRef: true,
          paymentUrl: true,
          status: true,
          expiresAt: true,
        },
      },
    };
  }

  private toCheckoutResponse(aggregate: {
    id: string;
    status: string;
    paymentMethod: PaymentMethod;
    amount: Prisma.Decimal;
    currency: string;
    orders: Array<{
      id: string;
      sellerId: string;
      totalAmount: Prisma.Decimal;
      status: string;
      paymentStatus: string;
    }>;
    transactions: Array<{
      txnRef: string;
      paymentUrl: string;
      status: string;
      expiresAt: Date;
    }>;
  }) {
    const transaction = aggregate.transactions[0] ?? null;
    return {
      aggregateId: aggregate.id,
      status: aggregate.status,
      paymentMethod: aggregate.paymentMethod,
      amount: aggregate.amount.toFixed(2),
      currency: aggregate.currency,
      orders: aggregate.orders.map((order) => ({
        ...order,
        totalAmount: order.totalAmount.toFixed(2),
      })),
      payment: transaction
        ? {
            txnRef: transaction.txnRef,
            status: transaction.status,
            paymentUrl: transaction.paymentUrl,
            expiresAt: transaction.expiresAt,
          }
        : null,
    };
  }

  private isIdempotencyUniqueViolation(error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const rawTarget = error.meta?.target;
    const target = Array.isArray(rawTarget)
      ? rawTarget
          .filter((value): value is string => typeof value === 'string')
          .join(',')
      : typeof rawTarget === 'string'
        ? rawTarget
        : '';
    return (
      target.includes('idempotency') ||
      (target.includes('user_id') && target.includes('idempotency_key'))
    );
  }

  private isRetryableTransactionError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
