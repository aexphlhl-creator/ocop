import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  GoneException,
  Logger,
} from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { OrderStatus, PaymentMethod, RoleName, Prisma } from '@prisma/client';
import { ProductsRepository } from '../products/products.repository';
import { VouchersService } from '../vouchers/vouchers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupplyChainService } from '../supply-chain/supply-chain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';
import { InventoryReservationService } from './inventory-reservation.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    public readonly ordersRepository: OrdersRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly vouchersService: VouchersService,
    private readonly prisma: PrismaService,
    private readonly supplyChainService: SupplyChainService,
    private readonly notificationsService: NotificationsService,
    private readonly inventoryReservations: InventoryReservationService,
  ) {}

  // ── Create Order (with inventory reserve) ────────────────────────────────

  create(dto: CreateOrderDto, user: RequestUser, ipAddress?: string) {
    void dto;
    void user;
    void ipAddress;
    throw new GoneException(
      'Endpoint tạo đơn cũ đã ngừng hoạt động. Sử dụng POST /api/v1/orders/checkout',
    );
    /* Legacy implementation retained temporarily for migration reference.
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Giỏ hàng trống');
    }

    let totalAmount = 0;
    const resolvedItems: Array<{
      productId: string;
      quantity: number;
      price: number;
      reservedBatchId?: string;
      inventoryId?: string;
    }> = [];

    // ── 1. Validate products + check inventory ──────────────────────────────
    for (const item of dto.items) {
      const product = await this.productsRepository.findById(item.productId);
      if (!product) {
        throw new NotFoundException(
          `Không tìm thấy sản phẩm ID ${item.productId}`,
        );
      }

      const price = Number(product.price);
      totalAmount += price * item.quantity;

      // Check inventory availability
      const inventory = await this.prisma.inventory.findFirst({
        where: {
          productId: item.productId,
          warehouse: { managerId: { not: null } },
        },
        include: {
          batches: {
            where: { status: 'ACTIVE', quantity: { gt: 0 } },
            orderBy: { receivedDate: 'asc' }, // FIFO
          },
        },
      });

      if (inventory) {
        const available =
          inventory.currentQuantity - inventory.reservedQuantity;
        if (available < item.quantity) {
          throw new BadRequestException(
            `Sản phẩm "${product.name}" không đủ tồn kho. Khả dụng: ${available}, Yêu cầu: ${item.quantity}`,
          );
        }

        // Find earliest FIFO batch for reservation
        const firstActiveBatch = inventory.batches[0];
        resolvedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          price,
          inventoryId: inventory.id,
          reservedBatchId: firstActiveBatch?.id,
        });
      } else {
        // No inventory record — allow order but don't reserve
        resolvedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          price,
        });
      }
    }

    // ── 2. Vouchers ──────────────────────────────────────────────────────────
    let totalDiscount = 0;
    let platformVoucherId: string | null = null;
    let shopVoucherId: string | null = null;

    if (dto.platformVoucherCode) {
      const v = await this.vouchersService.apply({
        code: dto.platformVoucherCode,
        businessId: dto.businessId,
        orderValue: totalAmount,
      });
      totalDiscount += v.discountAmount;
      platformVoucherId = v.id;
    }

    if (dto.shopVoucherCode) {
      const v = await this.vouchersService.apply({
        code: dto.shopVoucherCode,
        businessId: dto.businessId,
        orderValue: totalAmount,
      });
      totalDiscount += v.discountAmount;
      shopVoucherId = v.id;
    }

    if (totalDiscount > totalAmount) totalDiscount = totalAmount;
    const finalAmount = totalAmount - totalDiscount;

    // ── 3. Create order + reserve inventory (in transaction) ─────────────────
    const order = await this.prisma.$transaction(async (tx) => {
      // Build order items data
      const orderItemsData: any[] = resolvedItems.map((item) => ({
        quantity: item.quantity,
        price: item.price,
        product: { connect: { id: item.productId } },
        ...(item.reservedBatchId
          ? { reservedBatch: { connect: { id: item.reservedBatchId } } }
          : {}),
      }));

      const orderData: Prisma.OrderCreateInput = {
        totalAmount: finalAmount,
        discountAmount: totalDiscount,
        shippingAddress: dto.shippingAddress,
        phone: dto.phone,
        paymentMethod: dto.paymentMethod,
        note: (dto as any).note,
        user: { connect: { id: user.id } },
        business: { connect: { id: dto.businessId } },
        items: { create: orderItemsData },
        tracking: {
          create: {
            status: 'PENDING',
            description: 'Đơn hàng đã được tạo',
            changedById: user.id,
            ipAddress: ipAddress ?? null,
          },
        },
      };

      if (platformVoucherId) {
        orderData.platformVoucher = { connect: { id: platformVoucherId } };
      }
      if (shopVoucherId) {
        orderData.shopVoucher = { connect: { id: shopVoucherId } };
      }

      const newOrder = await tx.order.create({
        data: orderData,
        include: { items: true },
      });

      // Reserve inventory: increment reservedQuantity
      for (const item of resolvedItems) {
        if (item.inventoryId) {
          await tx.inventory.update({
            where: { id: item.inventoryId },
            data: { reservedQuantity: { increment: item.quantity } },
          });
          this.logger.log(
            `Reserved ${item.quantity} units in inventory ${item.inventoryId} for order ${newOrder.id}`,
          );
        }
      }

      // Increment voucher usage
      if (platformVoucherId) {
        await this.vouchersService['vouchersRepository'].incrementUsage(
          platformVoucherId,
        );
      }
      if (shopVoucherId) {
        await this.vouchersService['vouchersRepository'].incrementUsage(
          shopVoucherId,
        );
      }

      return newOrder;
    });

    return this.ordersRepository.findById(order.id);
    */
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  async getOrders(query: QueryOrdersDto, user: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.customerId) where.userId = query.customerId;
    if (query.sellerId) where.sellerId = query.sellerId;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    if (query.search) {
      where.OR = [
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { phone: { contains: query.search } },
      ];
    }

    // Seller chỉ xem đơn hàng thuộc tài khoản của chính họ.
    if (user.role === RoleName.SELLER) {
      where.sellerId = user.id;
    } else if (user.role === RoleName.VISITOR) {
      // User can only see their own orders
      where.userId = user.id;
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, images: { take: 1 } },
              },
              batchReservations: {
                select: {
                  quantity: true,
                  status: true,
                  batch: { select: { id: true, batchNumber: true } },
                },
              },
            },
          },
          user: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          seller: {
            select: { id: true, fullName: true, sellerProfile: true },
          },
          tracking: { orderBy: { createdAt: 'asc' } },
          shipments: {
            include: {
              carrierOrganization: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  providerCode: true,
                  trackingUrlTemplate: true,
                },
              },
              events: {
                orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
                select: {
                  id: true,
                  eventType: true,
                  source: true,
                  fromStatus: true,
                  toStatus: true,
                  eventTime: true,
                  location: true,
                  recipientName: true,
                  failureReason: true,
                  note: true,
                  imageUrls: true,
                  attachmentUrls: true,
                  createdAt: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return createPaginationResponse(items, total, page, limit);
  }

  async getMyOrders(user: RequestUser) {
    return this.ordersRepository.findByUserId(user.id);
  }

  async getSellerOrders(user: RequestUser) {
    return this.ordersRepository.findBySellerId(user.id);
  }

  async getOrderById(id: string, user?: RequestUser) {
    const order = await this.ordersRepository.findById(id);
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    // Visibility check
    if (user) {
      if (user.role === RoleName.VISITOR && order.userId !== user.id) {
        throw new ForbiddenException('Bạn không có quyền xem đơn hàng này');
      }
      if (user.role === RoleName.SELLER) {
        if (order.sellerId !== user.id) {
          throw new ForbiddenException(
            'Bạn không có quyền xem đơn hàng của gian hàng khác',
          );
        }
      }
    }

    return order;
  }

  // ── Update Order Status (with Inventory + Supply Chain side effects) ──────

  async updateOrderStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    user: RequestUser,
    ipAddress?: string,
  ) {
    const newStatus = dto.status;
    const description = this.buildDescription(dto, newStatus);
    const order = await this.prisma.$transaction(async (tx) => {
      const lockMetadata = await tx.order.findUnique({
        where: { id },
        select: {
          paymentAggregateId: true,
          paymentMethod: true,
        },
      });
      if (!lockMetadata) {
        throw new NotFoundException('Không tìm thấy đơn hàng');
      }

      // Keep the same deterministic lock order as IPN/reconciliation:
      // aggregate -> transactions -> orders. This prevents a cancellation
      // racing a successful payment from releasing reservations mid-capture.
      if (lockMetadata.paymentAggregateId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payment_aggregates"
            WHERE "id" = ${lockMetadata.paymentAggregateId}::uuid FOR UPDATE`,
        );
        if (
          newStatus === OrderStatus.CANCELLED &&
          lockMetadata.paymentMethod === PaymentMethod.VNPAY
        ) {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "payment_transactions"
              WHERE "payment_aggregate_id" = ${lockMetadata.paymentAggregateId}::uuid
              ORDER BY "id" FOR UPDATE`,
          );
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "orders"
              WHERE "payment_aggregate_id" = ${lockMetadata.paymentAggregateId}::uuid
              ORDER BY "id" FOR UPDATE`,
          );
        } else {
          await this.inventoryReservations.lockOrder(tx, id);
        }
      } else {
        await this.inventoryReservations.lockOrder(tx, id);
      }
      const freshOrder = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: true,
              batchReservations: { include: { batch: true } },
            },
          },
          seller: { include: { sellerProfile: true } },
          paymentAggregate: {
            include: { orders: { select: { id: true, status: true } } },
          },
        },
      });
      if (!freshOrder) {
        throw new NotFoundException('Không tìm thấy đơn hàng');
      }

      const isBuyerCancelling =
        user.id === freshOrder.userId && newStatus === OrderStatus.CANCELLED;
      if (
        user.role !== RoleName.ADMIN &&
        freshOrder.sellerId !== user.id &&
        !isBuyerCancelling
      ) {
        throw new ForbiddenException(
          'Bạn không có quyền cập nhật đơn hàng này',
        );
      }
      if (freshOrder.status === newStatus) {
        throw new BadRequestException(
          'Trạng thái mới phải khác trạng thái hiện tại',
        );
      }
      this.validateStatusTransition(freshOrder.status, newStatus);

      if (
        newStatus === OrderStatus.CONFIRMED &&
        freshOrder.paymentMethod === 'VNPAY' &&
        freshOrder.paymentStatus !== 'COMPLETED'
      ) {
        throw new BadRequestException(
          'Không thể xác nhận đơn VNPay trước khi IPN xác nhận thanh toán',
        );
      }

      if (
        (
          [
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.RETURNED,
          ] as OrderStatus[]
        ).includes(newStatus)
      ) {
        throw new BadRequestException(
          'Trạng thái vận chuyển/giao hàng/hoàn hàng chỉ được cập nhật tự động từ Shipment và bằng chứng giao nhận',
        );
      }

      if (newStatus === OrderStatus.CANCELLED) {
        const aggregate = freshOrder.paymentAggregate;
        const activeShipmentCount = await tx.shipment.count({
          where: {
            status: { not: 'CANCELLED' },
            ...(freshOrder.paymentMethod === 'VNPAY' && aggregate
              ? { order: { paymentAggregateId: aggregate.id } }
              : { orderId: id }),
          },
        });
        if (activeShipmentCount > 0) {
          throw new BadRequestException(
            'Đơn đã có chuyến hàng; Warehouse Manager phải hủy chuyến trước khi hủy đơn',
          );
        }
        if (
          freshOrder.paymentMethod === 'VNPAY' &&
          aggregate?.status === 'COMPLETED'
        ) {
          throw new BadRequestException(
            'Đơn đã thanh toán phải đi qua quy trình hoàn tiền',
          );
        }
        if (freshOrder.paymentMethod === 'VNPAY' && aggregate) {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "payment_aggregates"
              WHERE "id" = ${aggregate.id}::uuid FOR UPDATE`,
          );
          await this.inventoryReservations.releaseAggregate(tx, aggregate.id);
          const siblings = await tx.order.findMany({
            where: { paymentAggregateId: aggregate.id },
            select: { id: true, status: true },
            orderBy: { id: 'asc' },
          });
          for (const sibling of siblings) {
            if (sibling.status === OrderStatus.CANCELLED) continue;
            await tx.order.update({
              where: { id: sibling.id },
              data: {
                status: OrderStatus.CANCELLED,
                tracking: {
                  create: {
                    status: OrderStatus.CANCELLED,
                    description: 'Hủy toàn bộ checkout VNPay chưa thanh toán',
                    changedById: user.id,
                    ipAddress: ipAddress ?? null,
                  },
                },
              },
            });
          }
          await tx.paymentTransaction.updateMany({
            where: {
              paymentAggregateId: aggregate.id,
              status: 'PENDING',
            },
            data: { status: 'CANCELLED', processedAt: new Date() },
          });
          await tx.paymentAggregate.update({
            where: { id: aggregate.id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
          return freshOrder;
        }
        await this.inventoryReservations.releaseOrder(tx, id);
      }

      await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          ...(newStatus === OrderStatus.DELIVERED &&
          freshOrder.paymentMethod === 'COD'
            ? { paymentStatus: 'COMPLETED' }
            : {}),
          tracking: {
            create: {
              status: newStatus,
              description,
              changedById: user.id,
              ipAddress: ipAddress ?? null,
            },
          },
        },
      });

      if (freshOrder.paymentAggregateId) {
        const activeOrders = await tx.order.findMany({
          where: {
            paymentAggregateId: freshOrder.paymentAggregateId,
            status: { not: OrderStatus.CANCELLED },
          },
          select: { status: true, totalAmount: true },
        });
        const activeAmount = activeOrders.reduce(
          (total, sibling) => total.add(sibling.totalAmount),
          new Prisma.Decimal(0),
        );
        if (newStatus === OrderStatus.CANCELLED) {
          await tx.paymentAggregate.update({
            where: { id: freshOrder.paymentAggregateId },
            data:
              activeOrders.length === 0
                ? {
                    amount: new Prisma.Decimal(0),
                    status: 'CANCELLED',
                    cancelledAt: new Date(),
                  }
                : { amount: activeAmount },
          });
        } else if (
          freshOrder.paymentMethod === 'COD' &&
          activeOrders.every((sibling) =>
            (
              [OrderStatus.DELIVERED, OrderStatus.RETURNED] as OrderStatus[]
            ).includes(sibling.status),
          )
        ) {
          await tx.paymentAggregate.update({
            where: { id: freshOrder.paymentAggregateId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
      }
      return freshOrder;
    });

    // ── Auto Supply Chain Journey (outside transaction for isolation) ─────
    await this.createAutoJourney(id, newStatus, user, order);

    // Gửi thông báo cho người mua
    const shortId = id.slice(0, 8).toUpperCase();
    await this.notificationsService.createNotification(
      order.userId,
      `Đơn hàng #${shortId} được cập nhật`,
      `Trạng thái mới: ${newStatus}. ${description}`,
      'INFO',
      '/profile/orders',
    );

    return this.ordersRepository.findById(id);
  }

  // ── Cancel Order (by customer) ────────────────────────────────────────────

  async cancelOrder(id: string, user: RequestUser, ipAddress?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    // Only order owner can cancel (and only if PENDING or CONFIRMED)
    if (order.userId !== user.id && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền hủy đơn hàng này');
    }

    const cancelableStatuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
    ];
    if (!cancelableStatuses.includes(order.status)) {
      throw new BadRequestException(
        'Chỉ có thể hủy đơn ở trạng thái Chờ xác nhận hoặc Đã xác nhận',
      );
    }

    return this.updateOrderStatus(
      id,
      { status: OrderStatus.CANCELLED, description: 'Khách hàng tự hủy đơn' },
      user,
      ipAddress,
    );
  }

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  async getDashboardStats(user: RequestUser) {
    const where: Prisma.OrderWhereInput = {};

    if (user.role === RoleName.SELLER) {
      where.sellerId = user.id;
    }

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      total,
      pending,
      confirmed,
      packing,
      shipped,
      delivered,
      cancelled,
      returned,
      todayOrders,
      monthOrders,
    ] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.order.count({ where: { ...where, status: 'CONFIRMED' } }),
      this.prisma.order.count({ where: { ...where, status: 'PACKING' } }),
      this.prisma.order.count({ where: { ...where, status: 'SHIPPED' } }),
      this.prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.order.count({ where: { ...where, status: 'RETURNED' } }),
      this.prisma.order.count({
        where: { ...where, createdAt: { gte: startOfDay } },
      }),
      this.prisma.order.count({
        where: { ...where, createdAt: { gte: startOfMonth } },
      }),
    ]);

    // Revenue from DELIVERED orders
    const revenueResult = await this.prisma.order.aggregate({
      where: { ...where, status: 'DELIVERED' },
      _sum: { totalAmount: true },
    });

    const monthRevenueResult = await this.prisma.order.aggregate({
      where: {
        ...where,
        status: 'DELIVERED',
        createdAt: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
    });

    return {
      total,
      pending,
      confirmed,
      packing,
      shipped,
      delivered,
      cancelled,
      returned,
      todayOrders,
      monthOrders,
      totalRevenue: Number(revenueResult._sum.totalAmount ?? 0),
      monthRevenue: Number(monthRevenueResult._sum.totalAmount ?? 0),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private validateStatusTransition(from: OrderStatus, to: OrderStatus) {
    const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
      PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      CONFIRMED: [OrderStatus.PACKING, OrderStatus.CANCELLED],
      PACKING: [OrderStatus.CANCELLED],
      PROCESSING: [OrderStatus.CANCELLED], // legacy
      SHIPPED: [],
      DELIVERED: [],
      CANCELLED: [],
      RETURNED: [],
    };

    // eslint-disable-next-line security/detect-object-injection -- from is a validated OrderStatus enum and the table only contains enum keys.
    const allowed = transitions[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Không thể chuyển từ trạng thái "${from}" sang "${to}"`,
      );
    }
  }

  private buildDescription(
    dto: UpdateOrderStatusDto,
    status: OrderStatus,
  ): string {
    const base = dto.description ?? '';

    const defaults: Partial<Record<OrderStatus, string>> = {
      CONFIRMED: 'Đơn hàng đã được xác nhận',
      PACKING: 'Đang tiến hành đóng gói',
      SHIPPED: 'Đơn hàng đã được giao cho đơn vị vận chuyển',
      DELIVERED: 'Giao hàng thành công',
      CANCELLED: 'Đơn hàng đã bị hủy',
      RETURNED: 'Khách hàng đã hoàn trả hàng',
    };

    // eslint-disable-next-line security/detect-object-injection -- status is a validated OrderStatus enum used only to read a fixed message table.
    return base || defaults[status] || status;
  }

  private async createAutoJourney(
    orderId: string,
    status: OrderStatus,
    user: RequestUser,
    order: Prisma.OrderGetPayload<{
      include: {
        items: { include: { batchReservations: true } };
        seller: { include: { sellerProfile: true } };
      };
    }> & { user?: { fullName: string } },
  ) {
    const journeyStatuses: OrderStatus[] = [
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];
    if (!journeyStatuses.includes(status)) return;

    try {
      // Find stages
      const stageName =
        status === OrderStatus.SHIPPED ? 'SHIPPING' : 'CUSTOMER';

      const stage = await this.prisma.supplyChainStage.findUnique({
        where: { name: stageName },
      });

      if (!stage) return;

      // Get batches associated with order items
      const items = order.items ?? [];
      const batchIds = new Set<string>();

      for (const item of items) {
        for (const reservation of item.batchReservations ?? []) {
          if (reservation.batchId) batchIds.add(reservation.batchId);
        }
      }

      // If no reserved batches, try to find via inventory
      if (batchIds.size === 0) {
        for (const item of items) {
          const inv = await this.prisma.inventory.findFirst({
            where: { productId: item.productId },
            include: {
              batches: {
                where: {
                  status:
                    status === OrderStatus.SHIPPED
                      ? 'ACTIVE'
                      : { in: ['ACTIVE', 'DEPLETED'] },
                },
                orderBy: { receivedDate: 'asc' },
                take: 1,
              },
            },
          });
          if (inv?.batches[0]) batchIds.add(inv.batches[0].id);
        }
      }

      const location =
        status === OrderStatus.SHIPPED
          ? (order.seller?.sellerProfile?.address ?? 'Kho hàng')
          : (order.shippingAddress ?? 'Địa chỉ khách hàng');

      const actorName =
        status === OrderStatus.SHIPPED
          ? (order.seller?.sellerProfile?.displayName ??
            order.seller?.fullName ??
            'Nhà bán hàng')
          : (order.user?.fullName ?? 'Khách hàng');

      for (const batchId of batchIds) {
        await this.prisma.batchJourney.create({
          data: {
            batchId,
            stageId: stage.id,
            location,
            actorName,
            actorId: user.id,
            note: `Tự động từ đơn hàng #${orderId.slice(0, 8).toUpperCase()}`,
            imageUrls: [],
            attachmentUrls: [],
            blockchainPayload: {
              source: 'ORDER_AUTO',
              orderId,
              status,
              timestamp: new Date().toISOString(),
              actorId: user.id,
            },
          },
        });

        this.logger.log(
          `Auto Supply Chain Journey: batch=${batchId} stage=${stageName} order=${orderId}`,
        );
      }
    } catch (err) {
      // Non-blocking: log error but don't fail the status update
      this.logger.error(`Failed to create auto supply chain journey: ${err}`);
    }
  }
}
