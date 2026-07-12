import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { OrderStatus, RoleName, Prisma } from '@prisma/client';
import { ProductsRepository } from '../products/products.repository';
import { VouchersService } from '../vouchers/vouchers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupplyChainService } from '../supply-chain/supply-chain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

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
  ) {}

  // ── Create Order (with inventory reserve) ────────────────────────────────

  async create(dto: CreateOrderDto, user: RequestUser, ipAddress?: string) {
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
        throw new NotFoundException(`Không tìm thấy sản phẩm ID ${item.productId}`);
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
        const available = inventory.currentQuantity - inventory.reservedQuantity;
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

      const newOrder = await tx.order.create({ data: orderData, include: { items: true } });

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
        await this.vouchersService['vouchersRepository'].incrementUsage(platformVoucherId);
      }
      if (shopVoucherId) {
        await this.vouchersService['vouchersRepository'].incrementUsage(shopVoucherId);
      }

      return newOrder;
    });

    return this.ordersRepository.findById(order.id);
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  async getOrders(query: QueryOrdersDto, user: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.customerId) where.userId = query.customerId;
    if (query.businessId) where.businessId = query.businessId;

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

    // Seller can only see their own business orders
    if (user.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({
        where: { userId: user.id },
      });
      if (business) {
        where.businessId = business.id;
      } else {
        return createPaginationResponse([], 0, page, limit);
      }
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
              product: { select: { id: true, name: true, images: { take: 1 } } },
              reservedBatch: { select: { id: true, batchNumber: true } },
            },
          },
          user: { select: { id: true, fullName: true, email: true, phone: true } },
          business: { select: { id: true, name: true } },
          tracking: { orderBy: { createdAt: 'asc' } },
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
        const business = await this.prisma.business.findFirst({
          where: { userId: user.id },
        });
        if (!business || order.businessId !== business.id) {
          throw new ForbiddenException('Bạn không có quyền xem đơn hàng của gian hàng khác');
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
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            reservedBatch: { include: { inventory: true } },
          },
        },
        business: { include: { user: true } },
      },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    // Authorization: seller of this order, admin, or the buyer cancelling their own order
    const isBuyerCancelling = user.id === order.userId && dto.status === OrderStatus.CANCELLED;
    if (
      user.role !== RoleName.ADMIN &&
      order.business.userId !== user.id &&
      !isBuyerCancelling
    ) {
      throw new ForbiddenException('Bạn không có quyền cập nhật đơn hàng này');
    }

    const oldStatus = order.status;
    const newStatus = dto.status;

    if (oldStatus === newStatus) {
      throw new BadRequestException('Trạng thái mới phải khác trạng thái hiện tại');
    }

    // Validate transition
    this.validateStatusTransition(oldStatus, newStatus, user.role);

    const description = this.buildDescription(dto, newStatus);

    await this.prisma.$transaction(async (tx) => {
      // ── Update order status + add tracking entry ──────────────────────────
      await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
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

      // ── CANCELLED: release reserved quantity ─────────────────────────────
      if (newStatus === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          if (item.reservedBatch?.inventoryId) {
            await tx.inventory.update({
              where: { id: item.reservedBatch.inventoryId },
              data: { reservedQuantity: { decrement: item.quantity } },
            });
            this.logger.log(
              `Released ${item.quantity} reserved units from inventory ${item.reservedBatch.inventoryId}`,
            );
          }
        }
      }

      // ── SHIPPED: FIFO stock-out + release reserve + create StockMovements ─
      if (newStatus === OrderStatus.SHIPPED) {
        for (const item of order.items) {
          // Find inventory for this product
          const inventory = await tx.inventory.findFirst({
            where: { productId: item.productId },
          });

          if (!inventory) continue;

          // Get FIFO active batches
          const batches = await tx.inventoryBatch.findMany({
            where: { inventoryId: inventory.id, status: 'ACTIVE', quantity: { gt: 0 } },
            orderBy: { receivedDate: 'asc' },
          });

          let remaining = item.quantity;

          for (const batch of batches) {
            if (remaining <= 0) break;

            const deduct = Math.min(batch.quantity, remaining);
            const newBatchQty = batch.quantity - deduct;

            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                quantity: newBatchQty,
                status: newBatchQty === 0 ? 'DEPLETED' : 'ACTIVE',
              },
            });

            await tx.stockMovement.create({
              data: {
                inventory: { connect: { id: inventory.id } },
                batch: { connect: { id: batch.id } },
                movementType: 'OUT',
                quantity: -deduct,
                beforeQuantity: batch.quantity,
                afterQuantity: newBatchQty,
                referenceId: id,
                referenceType: 'ORDER',
                note: `Xuất kho cho đơn hàng`,
                createdBy: { connect: { id: user.id } },
              },
            });

            remaining -= deduct;
          }

          // Update inventory totals
          const newCurrent = Math.max(0, inventory.currentQuantity - item.quantity);
          const newReserved = Math.max(0, inventory.reservedQuantity - item.quantity);

          await tx.inventory.update({
            where: { id: inventory.id },
            data: {
              currentQuantity: newCurrent,
              reservedQuantity: newReserved,
            },
          });

          this.logger.log(
            `FIFO stock-out: inventory ${inventory.id}, -${item.quantity} for order ${id}`,
          );
        }
      }
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
      '/profile/orders'
    );

    return this.ordersRepository.findById(id);
  }

  // ── Cancel Order (by customer) ────────────────────────────────────────────

  async cancelOrder(id: string, user: RequestUser, ipAddress?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { reservedBatch: { include: { inventory: true } } } },
      },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');

    // Only order owner can cancel (and only if PENDING or CONFIRMED)
    if (order.userId !== user.id && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền hủy đơn hàng này');
    }

    const cancelableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
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
    const where: any = {};

    if (user.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({
        where: { userId: user.id },
      });
      if (business) {
        where.businessId = business.id;
      }
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      where: { ...where, status: 'DELIVERED', createdAt: { gte: startOfMonth } },
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

  private validateStatusTransition(
    from: OrderStatus,
    to: OrderStatus,
    role: RoleName,
  ) {
    const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
      PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      CONFIRMED: [OrderStatus.PACKING, OrderStatus.CANCELLED],
      PACKING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED], // legacy
      SHIPPED: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
      DELIVERED: [],
      CANCELLED: [],
      RETURNED: [],
    };

    const allowed = transitions[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Không thể chuyển từ trạng thái "${from}" sang "${to}"`,
      );
    }
  }

  private buildDescription(dto: UpdateOrderStatusDto, status: OrderStatus): string {
    const base = dto.description ?? '';

    if (status === OrderStatus.SHIPPED && dto.trackingCode) {
      const partner = dto.shippingPartner ? `[${dto.shippingPartner}]` : '';
      return `${partner} Mã vận đơn: ${dto.trackingCode}. ${base}`.trim();
    }

    const defaults: Partial<Record<OrderStatus, string>> = {
      CONFIRMED: 'Đơn hàng đã được xác nhận',
      PACKING: 'Đang tiến hành đóng gói',
      SHIPPED: 'Đơn hàng đã được giao cho đơn vị vận chuyển',
      DELIVERED: 'Giao hàng thành công',
      CANCELLED: 'Đơn hàng đã bị hủy',
      RETURNED: 'Khách hàng đã hoàn trả hàng',
    };

    return base || defaults[status] || status;
  }

  private async createAutoJourney(
    orderId: string,
    status: OrderStatus,
    user: RequestUser,
    order: any,
  ) {
    const journeyStatuses: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.DELIVERED];
    if (!journeyStatuses.includes(status)) return;

    try {
      // Find stages
      const stageName =
        status === OrderStatus.SHIPPED ? 'SHIPPING' : 'CUSTOMER';

      const stage = await this.prisma.supplyChainStage.findUnique({
        where: { name: stageName as any },
      });

      if (!stage) return;

      // Get batches associated with order items
      const items = order.items ?? [];
      const batchIds = new Set<string>();

      for (const item of items) {
        if (item.reservedBatchId) batchIds.add(item.reservedBatchId);
      }

      // If no reserved batches, try to find via inventory
      if (batchIds.size === 0) {
        for (const item of items) {
          const inv = await this.prisma.inventory.findFirst({
            where: { productId: item.productId },
            include: {
              batches: {
                where: { status: status === OrderStatus.SHIPPED ? 'ACTIVE' : { in: ['ACTIVE', 'DEPLETED'] } },
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
          ? order.business?.address ?? 'Kho hàng'
          : order.shippingAddress ?? 'Địa chỉ khách hàng';

      const actorName =
        status === OrderStatus.SHIPPED
          ? order.business?.name ?? 'Nhà bán hàng'
          : order.user?.fullName ?? 'Khách hàng';

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
