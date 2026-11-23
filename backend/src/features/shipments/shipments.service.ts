import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BatchStatus,
  CarrierWebhookProcessingStatus,
  OrderStatus,
  PaymentAggregateStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  QualityStatus,
  ReservationStatus,
  RoleName,
  ShipmentAssignmentStatus,
  ShipmentEventSource,
  ShipmentEventType,
  ShipmentRouteType,
  ShipmentStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { InventoryReservationService } from '../orders/inventory-reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLogisticsOrganizationDto,
  UpdateLogisticsOrganizationDto,
} from './dto/create-logistics-organization.dto';
import { CarrierWebhookDto } from './dto/carrier-webhook.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { QueryShipmentsDto } from './dto/query-shipments.dto';
import {
  AssignShipmentDto,
  CancelShipmentDto,
  HandoverShipmentDto,
  ShipmentEvidenceDto,
  TransitionShipmentDto,
} from './dto/shipment-actions.dto';

const shipmentInclude = Prisma.validator<Prisma.ShipmentInclude>()({
  originWarehouse: {
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      managerId: true,
    },
  },
  carrierOrganization: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      providerCode: true,
      trackingUrlTemplate: true,
    },
  },
  order: {
    select: { id: true, status: true, shippingAddress: true, phone: true },
  },
  items: {
    include: {
      batch: {
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          initialQuantity: true,
          qualityStatus: true,
          inventory: {
            select: {
              warehouseId: true,
              productId: true,
              product: {
                select: {
                  name: true,
                  sellerId: true,
                  seller: { include: { sellerProfile: true } },
                },
              },
            },
          },
        },
      },
      orderItem: { select: { id: true, orderId: true, productId: true } },
    },
  },
  assignments: {
    include: {
      logisticsUser: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
        },
      },
      assignedBy: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { assignedAt: 'desc' },
  },
  events: {
    include: {
      actor: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: [{ eventTime: 'asc' }, { createdAt: 'asc' }],
  },
});

type ShipmentDetails = Prisma.ShipmentGetPayload<{
  include: typeof shipmentInclude;
}>;

const ACTIVE_TRANSPORT_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.HANDED_OVER,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.AT_DISTRIBUTOR,
  ShipmentStatus.AT_RETAIL,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERY_FAILED,
  ShipmentStatus.RETURNING,
];

const ACTIVE_ASSIGNMENT_STATUSES: ShipmentAssignmentStatus[] = [
  ShipmentAssignmentStatus.ASSIGNED,
  ShipmentAssignmentStatus.IN_TRANSIT,
];

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryReservations: InventoryReservationService,
  ) {}

  async getOrganizations(includeInactive = false) {
    return this.prisma.logisticsOrganization.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: { select: { memberships: true, shipments: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createOrganization(dto: CreateLogisticsOrganizationDto) {
    try {
      return await this.prisma.logisticsOrganization.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          type: dto.type,
          providerCode: dto.providerCode?.trim().toUpperCase() || null,
          trackingUrlTemplate: dto.trackingUrlTemplate?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Mã đơn vị hoặc mã nhà cung cấp đã tồn tại',
        );
      }
      throw error;
    }
  }

  async updateOrganization(
    organizationId: string,
    dto: UpdateLogisticsOrganizationDto,
  ) {
    const data: Prisma.LogisticsOrganizationUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.providerCode !== undefined) {
      data.providerCode = dto.providerCode.trim().toUpperCase() || null;
    }
    if (dto.trackingUrlTemplate !== undefined) {
      data.trackingUrlTemplate = dto.trackingUrlTemplate.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.logisticsOrganization.update({
        where: { id: organizationId },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Mã đơn vị hoặc mã nhà cung cấp đã tồn tại',
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Không tìm thấy hãng vận chuyển');
      }
      throw error;
    }
  }

  async getFulfillmentOrders(currentUser: RequestUser) {
    this.requireRole(currentUser, RoleName.WAREHOUSE_MANAGER);
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PACKING, OrderStatus.PROCESSING] },
        OR: [
          { paymentMethod: PaymentMethod.COD },
          {
            paymentMethod: PaymentMethod.VNPAY,
            paymentStatus: PaymentStatus.COMPLETED,
          },
        ],
        items: {
          some: {
            batchReservations: {
              some: {
                status: ReservationStatus.ACTIVE,
                batch: {
                  inventory: {
                    warehouse: { managerId: currentUser.id, isActive: true },
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        shippingAddress: true,
        phone: true,
        createdAt: true,
        user: { select: { fullName: true, email: true } },
        seller: {
          select: {
            id: true,
            fullName: true,
            sellerProfile: { select: { displayName: true } },
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            product: { select: { id: true, name: true } },
            batchReservations: {
              where: {
                status: {
                  in: [ReservationStatus.ACTIVE, ReservationStatus.DEDUCTED],
                },
              },
              select: {
                quantity: true,
                status: true,
                batch: {
                  select: {
                    id: true,
                    batchNumber: true,
                    quantity: true,
                    status: true,
                    qualityStatus: true,
                    lifecycleStatus: true,
                    expiryDate: true,
                    inventory: {
                      select: {
                        warehouse: {
                          select: {
                            id: true,
                            code: true,
                            name: true,
                            managerId: true,
                            isActive: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (orders.length === 0) return [];
    const allocatedItems = await this.prisma.shipmentItem.findMany({
      where: {
        orderItem: { orderId: { in: orders.map((order) => order.id) } },
        shipment: {
          status: { in: [ShipmentStatus.DRAFT, ShipmentStatus.ASSIGNED] },
        },
      },
      select: { orderItemId: true, batchId: true },
    });
    const allocatedPairs = new Set(
      allocatedItems.map((item) => `${item.orderItemId}:${item.batchId}`),
    );

    return orders.flatMap((order) => {
      const ledgerIsComplete = order.items.every(
        (item) =>
          item.batchReservations.reduce(
            (total, reservation) => total + reservation.quantity,
            0,
          ) === item.quantity,
      );
      if (!ledgerIsComplete) return [];

      const groups = new Map<
        string,
        {
          warehouse: (typeof order.items)[number]['batchReservations'][number]['batch']['inventory']['warehouse'];
          items: typeof order.items;
        }
      >();
      for (const item of order.items) {
        for (const reservation of item.batchReservations) {
          const warehouse = reservation.batch.inventory.warehouse;
          if (
            reservation.status !== ReservationStatus.ACTIVE ||
            warehouse.managerId !== currentUser.id ||
            !warehouse.isActive ||
            reservation.batch.status !== BatchStatus.ACTIVE ||
            reservation.batch.qualityStatus !== QualityStatus.PASSED ||
            reservation.batch.lifecycleStatus !== 'RELEASED' ||
            (reservation.batch.expiryDate !== null &&
              reservation.batch.expiryDate <= new Date()) ||
            reservation.batch.quantity < reservation.quantity ||
            allocatedPairs.has(`${item.id}:${reservation.batch.id}`)
          ) {
            continue;
          }
          const group = groups.get(warehouse.id) ?? {
            warehouse,
            items: [],
          };
          const existingItem = group.items.find(
            (candidate) => candidate.id === item.id,
          );
          if (existingItem) {
            existingItem.batchReservations.push(reservation);
            existingItem.quantity += reservation.quantity;
          } else {
            group.items.push({
              ...item,
              quantity: reservation.quantity,
              batchReservations: [reservation],
            });
          }
          groups.set(warehouse.id, group);
        }
      }
      return [...groups.values()].map((group) => ({
        ...order,
        fulfillmentKey: `${order.id}:${group.warehouse.id}`,
        warehouse: group.warehouse,
        items: group.items,
      }));
    });
  }

  async list(query: QueryShipmentsDto, currentUser: RequestUser) {
    const where: Prisma.ShipmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...this.scopeWhere(currentUser),
    };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        include: shipmentInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.shipment.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getById(id: string, currentUser: RequestUser) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: shipmentInclude,
    });
    if (!shipment) throw new NotFoundException('Chuyến hàng không tồn tại');
    this.assertReadAccess(shipment, currentUser);
    return shipment;
  }

  async create(dto: CreateShipmentDto, currentUser: RequestUser) {
    this.requireRole(currentUser, RoleName.WAREHOUSE_MANAGER);
    const normalizedKey = dto.idempotencyKey.trim();
    const existing = await this.prisma.shipment.findUnique({
      where: {
        createdById_idempotencyKey: {
          createdById: currentUser.id,
          idempotencyKey: normalizedKey,
        },
      },
      include: shipmentInclude,
    });
    if (existing) return existing;

    const shipmentId = await this.prisma
      .$transaction(async (tx) => {
        const duplicate = await tx.shipment.findUnique({
          where: {
            createdById_idempotencyKey: {
              createdById: currentUser.id,
              idempotencyKey: normalizedKey,
            },
          },
          select: { id: true },
        });
        if (duplicate) return duplicate.id;

        const warehouse = await tx.warehouse.findFirst({
          where: {
            id: dto.originWarehouseId,
            managerId: currentUser.id,
            isActive: true,
          },
          select: { id: true },
        });
        if (!warehouse) {
          throw new ForbiddenException(
            'Bạn chỉ được tạo chuyến từ kho đang được giao quản lý',
          );
        }

        const organization = await tx.logisticsOrganization.findFirst({
          where: { id: dto.carrierOrganizationId, isActive: true },
          select: { id: true },
        });
        if (!organization) {
          throw new BadRequestException('Đơn vị vận chuyển không hoạt động');
        }
        const trackingCode = dto.trackingCode.trim();
        if (!trackingCode) {
          throw new BadRequestException(
            'Phải có mã vận đơn do hãng vận chuyển cấp',
          );
        }

        const pairKeys = new Set<string>();
        for (const item of dto.items) {
          const key = `${item.batchId}:${item.orderItemId ?? 'manual'}`;
          if (pairKeys.has(key)) {
            throw new BadRequestException(
              'Không được khai báo trùng một lô hàng',
            );
          }
          pairKeys.add(key);
        }

        const batchIds = [...new Set(dto.items.map((item) => item.batchId))];
        const batchReferences = await tx.inventoryBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, inventoryId: true },
        });
        if (batchReferences.length !== batchIds.length) {
          throw new BadRequestException('Có lô hàng không tồn tại');
        }
        const inventoryIds = [
          ...new Set(batchReferences.map((batch) => batch.inventoryId)),
        ].sort();
        const sortedBatchIds = [...batchIds].sort();
        // Consistent lock order with checkout/order deduction: inventory first,
        // then batch. This prevents overselling and cross-flow deadlocks.
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "inventories" WHERE "id" IN (${Prisma.join(
            inventoryIds.map((id) => Prisma.sql`${id}::uuid`),
          )}) ORDER BY "id" FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "inventory_batches" WHERE "id" IN (${Prisma.join(
            sortedBatchIds.map((id) => Prisma.sql`${id}::uuid`),
          )}) ORDER BY "id" FOR UPDATE`,
        );

        const batches = await tx.inventoryBatch.findMany({
          where: { id: { in: batchIds } },
          include: {
            inventory: {
              select: {
                id: true,
                warehouseId: true,
                productId: true,
                currentQuantity: true,
                reservedQuantity: true,
                product: { select: { sellerId: true } },
              },
            },
          },
        });
        if (batches.length !== batchIds.length) {
          throw new BadRequestException('Có lô hàng không tồn tại');
        }
        const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
        for (const batch of batches) {
          if (batch.inventory.warehouseId !== dto.originWarehouseId) {
            throw new BadRequestException('Tất cả lô phải thuộc cùng kho xuất');
          }
          if (
            batch.qualityStatus !== QualityStatus.PASSED ||
            batch.lifecycleStatus !== 'RELEASED' ||
            (batch.expiryDate && batch.expiryDate <= new Date())
          ) {
            throw new BadRequestException(
              `Lô ${batch.batchNumber} chưa đạt kiểm định chất lượng`,
            );
          }
          if (batch.status !== BatchStatus.ACTIVE) {
            throw new BadRequestException(
              `Lô ${batch.batchNumber} không còn hoạt động`,
            );
          }
        }

        let orderItemsById = new Map<
          string,
          {
            id: string;
            orderId: string;
            productId: string;
            batchReservations: Array<{
              batchId: string;
              quantity: number;
              status: ReservationStatus;
            }>;
          }
        >();
        if (dto.orderId) {
          const order = await tx.order.findUnique({
            where: { id: dto.orderId },
            select: {
              id: true,
              sellerId: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
              items: { select: { id: true, quantity: true } },
            },
          });
          if (
            !order ||
            !(
              [OrderStatus.PACKING, OrderStatus.PROCESSING] as OrderStatus[]
            ).includes(order.status)
          ) {
            throw new BadRequestException(
              'Đơn hàng phải ở trạng thái đang đóng gói để tạo chuyến',
            );
          }
          if (
            order.paymentMethod === PaymentMethod.VNPAY &&
            order.paymentStatus !== PaymentStatus.COMPLETED
          ) {
            throw new BadRequestException(
              'Đơn VNPay chưa được IPN xác nhận thanh toán',
            );
          }
          if (dto.items.some((item) => !item.orderItemId)) {
            throw new BadRequestException(
              'Chuyến theo đơn hàng phải liên kết từng dòng với order item',
            );
          }
          const orderItemIds = [
            ...new Set(dto.items.map((item) => item.orderItemId as string)),
          ];
          const orderItems = await tx.orderItem.findMany({
            where: { id: { in: orderItemIds }, orderId: dto.orderId },
            include: {
              batchReservations: {
                where: {
                  batchId: { in: batchIds },
                  status: ReservationStatus.ACTIVE,
                },
                select: { batchId: true, quantity: true, status: true },
              },
            },
          });
          if (orderItems.length !== orderItemIds.length) {
            throw new BadRequestException(
              'Order item không thuộc đơn hàng đã chọn',
            );
          }
          orderItemsById = new Map(orderItems.map((item) => [item.id, item]));
          for (const item of dto.items) {
            const orderItem = orderItemsById.get(item.orderItemId as string)!;
            const batch = batchesById.get(item.batchId)!;
            if (
              orderItem.productId !== batch.inventory.productId ||
              batch.inventory.product.sellerId !== order.sellerId
            ) {
              throw new BadRequestException(
                'Lô hàng không khớp sản phẩm hoặc gian hàng của đơn',
              );
            }
          }
          const reservationLedger = await tx.orderItemBatchReservation.findMany(
            {
              where: {
                orderItem: { orderId: dto.orderId },
              },
              select: {
                orderItemId: true,
                batchId: true,
                quantity: true,
                status: true,
                batch: {
                  select: {
                    inventory: { select: { warehouseId: true } },
                  },
                },
              },
            },
          );
          const reservedByOrderItem = new Map<string, number>();
          for (const reservation of reservationLedger) {
            if (
              !(
                [
                  ReservationStatus.ACTIVE,
                  ReservationStatus.DEDUCTED,
                ] as ReservationStatus[]
              ).includes(reservation.status)
            ) {
              continue;
            }
            reservedByOrderItem.set(
              reservation.orderItemId,
              (reservedByOrderItem.get(reservation.orderItemId) ?? 0) +
                reservation.quantity,
            );
          }
          if (
            order.items.some(
              (item) =>
                (reservedByOrderItem.get(item.id) ?? 0) !== item.quantity,
            )
          ) {
            throw new BadRequestException(
              'Reservation của đơn không còn bao phủ đủ toàn bộ số lượng đặt',
            );
          }
          const submitted = new Map(
            dto.items.map((item) => [
              `${item.orderItemId}:${item.batchId}`,
              item.quantity,
            ]),
          );
          const warehouseReservations = reservationLedger.filter(
            (reservation) =>
              reservation.status === ReservationStatus.ACTIVE &&
              reservation.batch.inventory.warehouseId === dto.originWarehouseId,
          );
          const coversEveryWarehouseReservation =
            warehouseReservations.length === dto.items.length &&
            warehouseReservations.every(
              (reservation) =>
                submitted.get(
                  `${reservation.orderItemId}:${reservation.batchId}`,
                ) === reservation.quantity,
            );
          if (!coversEveryWarehouseReservation) {
            throw new BadRequestException(
              'Chuyến theo đơn phải bao phủ chính xác toàn bộ reservation ACTIVE thuộc kho xuất; một reservation không được tách qua nhiều chuyến',
            );
          }
        } else if (dto.items.some((item) => item.orderItemId)) {
          throw new BadRequestException(
            'Phải cung cấp orderId khi có orderItemId',
          );
        }

        const existingItems = await tx.shipmentItem.findMany({
          where: {
            batchId: { in: batchIds },
            shipment: {
              status: {
                in: [ShipmentStatus.DRAFT, ShipmentStatus.ASSIGNED],
              },
            },
          },
          select: { batchId: true, orderItemId: true, quantity: true },
        });
        const activeBatchReservations =
          await tx.orderItemBatchReservation.groupBy({
            by: ['batchId'],
            where: {
              batchId: { in: batchIds },
              status: ReservationStatus.ACTIVE,
            },
            _sum: { quantity: true },
          });
        const reservedForOrders = new Map(
          activeBatchReservations.map((reservation) => [
            reservation.batchId,
            reservation._sum.quantity ?? 0,
          ]),
        );
        for (const item of dto.items) {
          const batch = batchesById.get(item.batchId)!;
          const alreadyAllocated = existingItems
            .filter(
              (existingItem) =>
                existingItem.batchId === item.batchId &&
                existingItem.orderItemId === (item.orderItemId ?? null),
            )
            .reduce((sum, existingItem) => sum + existingItem.quantity, 0);

          if (item.orderItemId) {
            const reservation = orderItemsById
              .get(item.orderItemId)!
              .batchReservations.find(
                (candidate) =>
                  candidate.batchId === item.batchId &&
                  candidate.status === ReservationStatus.ACTIVE,
              );
            if (
              !reservation ||
              alreadyAllocated + item.quantity > reservation.quantity
            ) {
              throw new BadRequestException(
                `Số lượng giao của lô ${batch.batchNumber} vượt phần đã giữ cho đơn hàng`,
              );
            }
          } else {
            const manualAllocated = existingItems
              .filter(
                (existingItem) =>
                  existingItem.batchId === item.batchId &&
                  existingItem.orderItemId === null,
              )
              .reduce((sum, existingItem) => sum + existingItem.quantity, 0);
            const batchAvailable =
              batch.quantity -
              (reservedForOrders.get(item.batchId) ?? 0) -
              manualAllocated;
            if (item.quantity > batchAvailable) {
              throw new BadRequestException(
                `Số lượng giao của lô ${batch.batchNumber} vượt tồn chưa được phân bổ (${Math.max(batchAvailable, 0)})`,
              );
            }
          }
        }

        if (!dto.orderId) {
          const reserveByInventory = new Map<string, number>();
          for (const item of dto.items) {
            const inventoryId = batchesById.get(item.batchId)!.inventory.id;
            reserveByInventory.set(
              inventoryId,
              (reserveByInventory.get(inventoryId) ?? 0) + item.quantity,
            );
          }
          for (const [inventoryId, quantity] of [
            ...reserveByInventory.entries(),
          ].sort(([left], [right]) => left.localeCompare(right))) {
            const inventory = batches.find(
              (batch) => batch.inventory.id === inventoryId,
            )!.inventory;
            if (
              inventory.currentQuantity - inventory.reservedQuantity <
              quantity
            ) {
              throw new BadRequestException(
                'Tồn khả dụng đã thay đổi trong lúc tạo chuyến',
              );
            }
            await tx.inventory.update({
              where: { id: inventoryId },
              data: { reservedQuantity: { increment: quantity } },
            });
          }
        }

        const now = new Date();
        const shipment = await tx.shipment.create({
          data: {
            shipmentNumber: `SHP-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
            idempotencyKey: normalizedKey,
            orderId: dto.orderId,
            originWarehouseId: dto.originWarehouseId,
            carrierOrganizationId: dto.carrierOrganizationId,
            routeType: dto.routeType,
            status: ShipmentStatus.ASSIGNED,
            trackingCode,
            destinationName: dto.destinationName.trim(),
            destinationAddress: dto.destinationAddress.trim(),
            destinationPhone: dto.destinationPhone?.trim() || null,
            createdById: currentUser.id,
            items: {
              create: dto.items.map((item) => ({
                batchId: item.batchId,
                orderItemId: item.orderItemId,
                quantity: item.quantity,
              })),
            },
          },
          select: { id: true },
        });
        await this.createEvent(tx, {
          shipmentId: shipment.id,
          idempotencyKey: normalizedKey,
          eventType: ShipmentEventType.CREATED,
          fromStatus: null,
          toStatus: ShipmentStatus.ASSIGNED,
          actorId: currentUser.id,
          eventTime: now,
          note: 'Tạo vận đơn với hãng vận chuyển',
          metadata: {
            carrierOrganizationId: dto.carrierOrganizationId,
            trackingCode,
          },
        });
        return shipment.id;
      })
      .catch(async (error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const concurrent = await this.prisma.shipment.findUnique({
            where: {
              createdById_idempotencyKey: {
                createdById: currentUser.id,
                idempotencyKey: normalizedKey,
              },
            },
            select: { id: true },
          });
          if (concurrent) return concurrent.id;
        }
        throw error;
      });

    return this.getById(shipmentId, currentUser);
  }

  assign(shipmentId: string, dto: AssignShipmentDto, currentUser: RequestUser) {
    void shipmentId;
    void dto;
    void currentUser;
    return Promise.reject(
      new GoneException(
        'Hệ thống không phân công nhân viên vận chuyển nội bộ. Hãy chọn hãng vận chuyển khi tạo vận đơn và theo dõi qua webhook/tracking của hãng.',
      ),
    );
  }

  async handover(
    shipmentId: string,
    dto: HandoverShipmentDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    this.requireRole(currentUser, RoleName.WAREHOUSE_MANAGER);
    await this.prisma.$transaction(async (tx) => {
      const shipment = await this.lockAndLoad(tx, shipmentId);
      this.assertManager(shipment, currentUser);
      if (await this.isDuplicateEvent(tx, shipmentId, dto.idempotencyKey))
        return;
      this.assertVersion(shipment, dto.expectedVersion);
      if (shipment.status !== ShipmentStatus.ASSIGNED) {
        throw new BadRequestException(
          'Chuyến phải có vận đơn với hãng trước khi bàn giao',
        );
      }
      if (!shipment.trackingCode) {
        throw new BadRequestException('Phải có mã vận đơn trước khi bàn giao');
      }
      this.requireEvidence(dto, 'Bàn giao');
      const eventTime = this.eventTime(dto, shipment.events);
      if (shipment.orderId) {
        await this.inventoryReservations.deductShipment(
          tx,
          shipment.id,
          shipment.orderId,
          currentUser.id,
        );
      } else {
        await this.deductManualShipmentInventory(tx, shipment, currentUser.id);
      }
      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.HANDED_OVER,
          handedOverAt: eventTime,
          version: { increment: 1 },
        },
      });
      await this.createEvent(tx, {
        shipmentId,
        idempotencyKey: dto.idempotencyKey,
        eventType: ShipmentEventType.HANDED_OVER,
        fromStatus: shipment.status,
        toStatus: ShipmentStatus.HANDED_OVER,
        actorId: currentUser.id,
        eventTime,
        location: dto.location.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        note: dto.note?.trim(),
        imageUrls: dto.imageUrls,
        attachmentUrls: dto.attachmentUrls,
        ipAddress,
      });
      await this.syncOrderStatus(
        tx,
        shipment.orderId,
        ShipmentStatus.HANDED_OVER,
        {
          shipmentId,
          actorId: currentUser.id,
        },
      );
    });
    return this.getById(shipmentId, currentUser);
  }

  transition(
    shipmentId: string,
    dto: TransitionShipmentDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    void shipmentId;
    void dto;
    void currentUser;
    void ipAddress;
    return Promise.reject(
      new GoneException(
        'Trạng thái giao hàng chỉ được cập nhật từ webhook/API của hãng vận chuyển.',
      ),
    );
  }

  async cancel(
    shipmentId: string,
    dto: CancelShipmentDto,
    currentUser: RequestUser,
  ) {
    this.requireRole(currentUser, RoleName.WAREHOUSE_MANAGER);
    await this.prisma.$transaction(async (tx) => {
      const shipment = await this.lockAndLoad(tx, shipmentId);
      this.assertManager(shipment, currentUser);
      if (await this.isDuplicateEvent(tx, shipmentId, dto.idempotencyKey))
        return;
      this.assertVersion(shipment, dto.expectedVersion);
      if (
        !(
          [ShipmentStatus.DRAFT, ShipmentStatus.ASSIGNED] as ShipmentStatus[]
        ).includes(shipment.status)
      ) {
        throw new BadRequestException(
          'Sau bàn giao phải dùng quy trình hoàn hàng, không được hủy trực tiếp',
        );
      }
      const now = new Date();
      if (!shipment.orderId) {
        await this.releaseManualShipmentReservation(tx, shipment);
      }
      await tx.shipmentAssignment.updateMany({
        where: {
          shipmentId,
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        },
        data: {
          status: ShipmentAssignmentStatus.CANCELLED,
          cancellationReason: dto.reason.trim(),
          cancelledAt: now,
        },
      });
      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: dto.reason.trim(),
          version: { increment: 1 },
        },
      });
      await this.createEvent(tx, {
        shipmentId,
        idempotencyKey: dto.idempotencyKey,
        eventType: ShipmentEventType.CANCELLED,
        fromStatus: shipment.status,
        toStatus: ShipmentStatus.CANCELLED,
        actorId: currentUser.id,
        eventTime: now,
        note: dto.reason.trim(),
      });
    });
    return this.getById(shipmentId, currentUser);
  }

  async processCarrierWebhook(
    providerCode: string,
    dto: CarrierWebhookDto,
    payloadHash: string,
  ) {
    const organization = await this.prisma.logisticsOrganization.findFirst({
      where: {
        isActive: true,
        OR: [{ providerCode }, { code: providerCode }],
      },
      select: { id: true, code: true },
    });
    if (!organization) {
      throw new NotFoundException(
        'Không tìm thấy đơn vị vận chuyển cho webhook',
      );
    }
    const normalizedEventId = dto.externalEventId.trim();
    const duplicate = await this.prisma.carrierWebhookEvent.findUnique({
      where: {
        organizationId_externalEventId: {
          organizationId: organization.id,
          externalEventId: normalizedEventId,
        },
      },
      select: { shipmentId: true },
    });
    if (duplicate) {
      return {
        accepted: true,
        duplicate: true,
        shipmentId: duplicate.shipmentId,
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const shipmentReference = await tx.shipment.findUnique({
          where: {
            carrierOrganizationId_trackingCode: {
              carrierOrganizationId: organization.id,
              trackingCode: dto.trackingCode.trim(),
            },
          },
          select: { id: true },
        });
        if (!shipmentReference) {
          throw new NotFoundException('Không tìm thấy chuyến theo mã vận đơn');
        }
        const shipment = await this.lockAndLoad(tx, shipmentReference.id);
        const replay = await tx.carrierWebhookEvent.findUnique({
          where: {
            organizationId_externalEventId: {
              organizationId: organization.id,
              externalEventId: normalizedEventId,
            },
          },
          select: { shipmentId: true },
        });
        if (replay) {
          return {
            accepted: true,
            duplicate: true,
            shipmentId: replay.shipmentId,
          };
        }

        const toStatus = this.resolveTransition(
          shipment.routeType,
          shipment.status,
          dto.eventType,
        );
        if (dto.eventType === ShipmentEventType.DELIVERED) {
          dto.recipientName = dto.recipientName?.trim() || undefined;
        }
        if (dto.eventType === ShipmentEventType.DELIVERY_FAILED) {
          dto.failureReason = dto.failureReason?.trim() || undefined;
        }
        if (
          dto.eventType === ShipmentEventType.RETURN_STARTED &&
          !dto.failureReason?.trim() &&
          !dto.note?.trim()
        ) {
          throw new BadRequestException('Webhook hoàn hàng phải có lý do');
        }

        const eventTime = new Date(dto.eventTime);
        if (eventTime.getTime() > Date.now() + 60_000) {
          throw new BadRequestException(
            'Thời điểm webhook không được ở tương lai',
          );
        }
        const latest = shipment.events.at(-1);
        if (latest && eventTime.getTime() < latest.eventTime.getTime()) {
          throw new BadRequestException('Webhook cũ hơn sự kiện gần nhất');
        }

        if (toStatus === ShipmentStatus.RETURNED) {
          await this.receiveReturnedInventory(
            tx,
            shipment,
            shipment.createdById,
            eventTime,
          );
        }

        await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: toStatus,
            version: { increment: 1 },
            ...(toStatus === ShipmentStatus.DELIVERED
              ? { deliveredAt: eventTime }
              : {}),
          },
        });
        const activeAssignment = shipment.assignments.find((assignment) =>
          ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status),
        );
        if (activeAssignment) {
          if (
            dto.eventType === ShipmentEventType.PICKED_UP ||
            dto.eventType === ShipmentEventType.DELIVERY_RETRIED
          ) {
            await tx.shipmentAssignment.update({
              where: { id: activeAssignment.id },
              data: {
                status: ShipmentAssignmentStatus.IN_TRANSIT,
                startedAt: activeAssignment.startedAt ?? eventTime,
              },
            });
          } else if (
            toStatus === ShipmentStatus.DELIVERED ||
            toStatus === ShipmentStatus.RETURNED
          ) {
            await tx.shipmentAssignment.update({
              where: { id: activeAssignment.id },
              data: {
                status: ShipmentAssignmentStatus.COMPLETED,
                completedAt: eventTime,
              },
            });
          }
        }

        const eventIdempotencyKey = `wh-${createHash('sha256')
          .update(`${organization.id}:${normalizedEventId}`)
          .digest('hex')}`;
        await this.createEvent(tx, {
          shipmentId: shipment.id,
          idempotencyKey: eventIdempotencyKey,
          eventType: dto.eventType,
          source: ShipmentEventSource.CARRIER_WEBHOOK,
          fromStatus: shipment.status,
          toStatus,
          eventTime,
          location: dto.location.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          recipientName: dto.recipientName?.trim(),
          failureReason: dto.failureReason?.trim(),
          note: dto.note?.trim(),
          imageUrls: dto.imageUrls,
          attachmentUrls: dto.attachmentUrls,
          metadata: {
            providerCode,
            externalEventId: normalizedEventId,
            payloadHash,
          },
        });
        await tx.carrierWebhookEvent.create({
          data: {
            organizationId: organization.id,
            shipmentId: shipment.id,
            externalEventId: normalizedEventId,
            trackingCode: dto.trackingCode.trim(),
            payloadHash,
            payload: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
            signatureValid: true,
            status: CarrierWebhookProcessingStatus.PROCESSED,
            processedAt: new Date(),
          },
        });
        await this.syncOrderStatus(tx, shipment.orderId, toStatus, {
          shipmentId: shipment.id,
        });
        return {
          accepted: true,
          duplicate: false,
          shipmentId: shipment.id,
          status: toStatus,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.prisma.carrierWebhookEvent.findUnique({
          where: {
            organizationId_externalEventId: {
              organizationId: organization.id,
              externalEventId: normalizedEventId,
            },
          },
          select: { shipmentId: true },
        });
        if (replay) {
          return {
            accepted: true,
            duplicate: true,
            shipmentId: replay.shipmentId,
          };
        }
      }
      throw error;
    }
  }

  private scopeWhere(currentUser: RequestUser): Prisma.ShipmentWhereInput {
    switch (currentUser.role) {
      case RoleName.ADMIN:
        return {};
      case RoleName.WAREHOUSE_MANAGER:
        return { originWarehouse: { managerId: currentUser.id } };
      case RoleName.SELLER:
        return {
          items: {
            some: {
              batch: {
                inventory: {
                  product: { sellerId: currentUser.id },
                },
              },
            },
          },
        };
      default:
        return { id: '__forbidden__' };
    }
  }

  private assertReadAccess(
    shipment: ShipmentDetails,
    currentUser: RequestUser,
  ) {
    if (currentUser.role === RoleName.ADMIN) return;
    if (
      currentUser.role === RoleName.WAREHOUSE_MANAGER &&
      shipment.originWarehouse.managerId === currentUser.id
    ) {
      return;
    }
    if (
      currentUser.role === RoleName.SELLER &&
      shipment.items.some(
        (item) => item.batch.inventory.product.sellerId === currentUser.id,
      )
    ) {
      return;
    }
    throw new ForbiddenException('Bạn không có quyền xem chuyến hàng này');
  }

  private assertManager(shipment: ShipmentDetails, currentUser: RequestUser) {
    if (shipment.originWarehouse.managerId !== currentUser.id) {
      throw new ForbiddenException('Bạn không quản lý kho xuất của chuyến này');
    }
  }

  private requireRole(currentUser: RequestUser, role: RoleName) {
    if (currentUser.role !== role) {
      throw new ForbiddenException(
        'Vai trò không được phép thực hiện thao tác này',
      );
    }
  }

  private assertVersion(shipment: ShipmentDetails, expectedVersion: number) {
    if (shipment.version !== expectedVersion) {
      throw new ConflictException(
        'Chuyến hàng đã được cập nhật ở nơi khác. Vui lòng tải lại dữ liệu.',
      );
    }
  }

  private async lockAndLoad(tx: Prisma.TransactionClient, shipmentId: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "shipments" WHERE "id" = ${shipmentId}::uuid FOR UPDATE`,
    );
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: shipmentInclude,
    });
    if (!shipment) throw new NotFoundException('Chuyến hàng không tồn tại');
    return shipment;
  }

  private async isDuplicateEvent(
    tx: Prisma.TransactionClient,
    shipmentId: string,
    idempotencyKey: string,
  ) {
    const event = await tx.shipmentEvent.findUnique({
      where: {
        shipmentId_idempotencyKey: {
          shipmentId,
          idempotencyKey: idempotencyKey.trim(),
        },
      },
      select: { id: true },
    });
    return Boolean(event);
  }

  private requireEvidence(dto: ShipmentEvidenceDto, label: string) {
    if (
      (dto.imageUrls?.length ?? 0) + (dto.attachmentUrls?.length ?? 0) ===
      0
    ) {
      throw new BadRequestException(`${label} phải có ít nhất một minh chứng`);
    }
  }

  private eventTime(
    dto: ShipmentEvidenceDto,
    events: ShipmentDetails['events'],
  ) {
    const value = dto.eventTime ? new Date(dto.eventTime) : new Date();
    if (value.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Thời điểm sự kiện không được ở tương lai');
    }
    const latest = events.at(-1);
    if (latest && value.getTime() < latest.eventTime.getTime()) {
      throw new BadRequestException('Thời điểm phải sau sự kiện gần nhất');
    }
    return value;
  }

  private resolveTransition(
    routeType: ShipmentRouteType,
    status: ShipmentStatus,
    eventType: ShipmentEventType,
  ): ShipmentStatus {
    if (eventType === ShipmentEventType.DELIVERY_FAILED) {
      if (
        !ACTIVE_TRANSPORT_STATUSES.includes(status) ||
        status === ShipmentStatus.RETURNING
      ) {
        throw new BadRequestException(
          'Không thể ghi nhận giao thất bại ở trạng thái này',
        );
      }
      return ShipmentStatus.DELIVERY_FAILED;
    }
    if (
      eventType === ShipmentEventType.DELIVERY_RETRIED &&
      status === ShipmentStatus.DELIVERY_FAILED
    ) {
      return ShipmentStatus.IN_TRANSIT;
    }
    if (
      eventType === ShipmentEventType.RETURN_STARTED &&
      (
        [
          ShipmentStatus.DELIVERY_FAILED,
          ShipmentStatus.DELIVERED,
        ] as ShipmentStatus[]
      ).includes(status)
    ) {
      return ShipmentStatus.RETURNING;
    }
    if (
      eventType === ShipmentEventType.RETURNED &&
      status === ShipmentStatus.RETURNING
    ) {
      return ShipmentStatus.RETURNED;
    }
    if (
      eventType === ShipmentEventType.PICKED_UP &&
      status === ShipmentStatus.HANDED_OVER
    ) {
      return ShipmentStatus.IN_TRANSIT;
    }

    const routeTransitions: Record<
      ShipmentRouteType,
      Partial<Record<ShipmentStatus, [ShipmentEventType, ShipmentStatus]>>
    > = {
      [ShipmentRouteType.DIRECT_TO_CUSTOMER]: {
        [ShipmentStatus.IN_TRANSIT]: [
          ShipmentEventType.OUT_FOR_DELIVERY,
          ShipmentStatus.OUT_FOR_DELIVERY,
        ],
        [ShipmentStatus.OUT_FOR_DELIVERY]: [
          ShipmentEventType.DELIVERED,
          ShipmentStatus.DELIVERED,
        ],
      },
      [ShipmentRouteType.VIA_DISTRIBUTOR]: {
        [ShipmentStatus.IN_TRANSIT]: [
          ShipmentEventType.ARRIVED_DISTRIBUTOR,
          ShipmentStatus.AT_DISTRIBUTOR,
        ],
        [ShipmentStatus.AT_DISTRIBUTOR]: [
          ShipmentEventType.OUT_FOR_DELIVERY,
          ShipmentStatus.OUT_FOR_DELIVERY,
        ],
        [ShipmentStatus.OUT_FOR_DELIVERY]: [
          ShipmentEventType.DELIVERED,
          ShipmentStatus.DELIVERED,
        ],
      },
      [ShipmentRouteType.VIA_RETAIL]: {
        [ShipmentStatus.IN_TRANSIT]: [
          ShipmentEventType.ARRIVED_DISTRIBUTOR,
          ShipmentStatus.AT_DISTRIBUTOR,
        ],
        [ShipmentStatus.AT_DISTRIBUTOR]: [
          ShipmentEventType.ARRIVED_RETAIL,
          ShipmentStatus.AT_RETAIL,
        ],
        [ShipmentStatus.AT_RETAIL]: [
          ShipmentEventType.OUT_FOR_DELIVERY,
          ShipmentStatus.OUT_FOR_DELIVERY,
        ],
        [ShipmentStatus.OUT_FOR_DELIVERY]: [
          ShipmentEventType.DELIVERED,
          ShipmentStatus.DELIVERED,
        ],
      },
      [ShipmentRouteType.INTERNAL_TRANSFER]: {
        [ShipmentStatus.IN_TRANSIT]: [
          ShipmentEventType.DELIVERED,
          ShipmentStatus.DELIVERED,
        ],
      },
    };

    const transition = routeTransitions[routeType][status];
    if (!transition || transition[0] !== eventType) {
      throw new BadRequestException(
        `Chuyển trạng thái ${eventType} không hợp lệ từ ${status} với tuyến ${routeType}`,
      );
    }
    return transition[1];
  }

  private async deductManualShipmentInventory(
    tx: Prisma.TransactionClient,
    shipment: ShipmentDetails,
    actorId: string,
  ) {
    const references = await tx.shipmentItem.findMany({
      where: { shipmentId: shipment.id },
      select: {
        batchId: true,
        quantity: true,
        batch: { select: { inventoryId: true } },
      },
    });
    if (references.length === 0) {
      throw new BadRequestException('Chuyến hàng không có lô để xuất kho');
    }
    const inventoryIds = [
      ...new Set(references.map((item) => item.batch.inventoryId)),
    ].sort();
    const batchIds = [
      ...new Set(references.map((item) => item.batchId)),
    ].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventories" WHERE "id" IN (${Prisma.join(
        inventoryIds.map((id) => Prisma.sql`${id}::uuid`),
      )}) ORDER BY "id" FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventory_batches" WHERE "id" IN (${Prisma.join(
        batchIds.map((id) => Prisma.sql`${id}::uuid`),
      )}) ORDER BY "id" FOR UPDATE`,
    );
    const items = await tx.shipmentItem.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { id: 'asc' },
      select: {
        quantity: true,
        batch: {
          select: {
            id: true,
            batchNumber: true,
            quantity: true,
            status: true,
            inventoryId: true,
            lifecycleStatus: true,
            qualityStatus: true,
            expiryDate: true,
          },
        },
      },
    });
    const quantityByInventory = new Map<string, number>();
    for (const item of items) {
      if (
        item.batch.status !== BatchStatus.ACTIVE ||
        item.batch.lifecycleStatus !== 'RELEASED' ||
        item.batch.qualityStatus !== QualityStatus.PASSED ||
        (item.batch.expiryDate !== null &&
          item.batch.expiryDate <= new Date()) ||
        item.batch.quantity < item.quantity
      ) {
        throw new BadRequestException(
          `Lô ${item.batch.batchNumber} không còn đủ số lượng đã phân bổ`,
        );
      }
      const afterQuantity = item.batch.quantity - item.quantity;
      const updated = await tx.inventoryBatch.updateMany({
        where: {
          id: item.batch.id,
          status: BatchStatus.ACTIVE,
          quantity: item.batch.quantity,
        },
        data: {
          quantity: { decrement: item.quantity },
          ...(afterQuantity === 0 ? { status: BatchStatus.DEPLETED } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          `Lô ${item.batch.batchNumber} đã thay đổi trong lúc bàn giao`,
        );
      }
      await tx.stockMovement.create({
        data: {
          inventoryId: item.batch.inventoryId,
          batchId: item.batch.id,
          movementType: 'OUT',
          quantity: -item.quantity,
          beforeQuantity: item.batch.quantity,
          afterQuantity,
          referenceId: shipment.id,
          referenceType: 'SHIPMENT',
          note: `Xuất kho khi bàn giao chuyến ${shipment.shipmentNumber}`,
          createdById: actorId,
        },
      });
      quantityByInventory.set(
        item.batch.inventoryId,
        (quantityByInventory.get(item.batch.inventoryId) ?? 0) + item.quantity,
      );
    }
    for (const [inventoryId, quantity] of [
      ...quantityByInventory.entries(),
    ].sort(([left], [right]) => left.localeCompare(right))) {
      const updated = await tx.inventory.updateMany({
        where: {
          id: inventoryId,
          currentQuantity: { gte: quantity },
          reservedQuantity: { gte: quantity },
        },
        data: {
          currentQuantity: { decrement: quantity },
          reservedQuantity: { decrement: quantity },
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Tổng tồn kho hoặc phần giữ cho chuyến không nhất quán',
        );
      }
    }
  }

  private async releaseManualShipmentReservation(
    tx: Prisma.TransactionClient,
    shipment: ShipmentDetails,
  ) {
    const items = await tx.shipmentItem.findMany({
      where: { shipmentId: shipment.id },
      select: {
        quantity: true,
        batch: { select: { inventoryId: true } },
      },
    });
    const quantityByInventory = new Map<string, number>();
    for (const item of items) {
      quantityByInventory.set(
        item.batch.inventoryId,
        (quantityByInventory.get(item.batch.inventoryId) ?? 0) + item.quantity,
      );
    }
    const inventoryIds = [...quantityByInventory.keys()].sort();
    if (inventoryIds.length === 0) return;
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventories" WHERE "id" IN (${Prisma.join(
        inventoryIds.map((id) => Prisma.sql`${id}::uuid`),
      )}) ORDER BY "id" FOR UPDATE`,
    );
    for (const inventoryId of inventoryIds) {
      const quantity = quantityByInventory.get(inventoryId)!;
      const updated = await tx.inventory.updateMany({
        where: { id: inventoryId, reservedQuantity: { gte: quantity } },
        data: { reservedQuantity: { decrement: quantity } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Phần tồn giữ cho chuyến không nhất quán; đã hủy thao tác',
        );
      }
    }
  }

  private async receiveReturnedInventory(
    tx: Prisma.TransactionClient,
    shipment: ShipmentDetails,
    actorId: string,
    receivedAt: Date,
  ) {
    const items = await tx.shipmentItem.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { id: 'asc' },
      select: {
        quantity: true,
        batch: {
          select: {
            batchNumber: true,
            id: true,
            inventoryId: true,
            manufactureDate: true,
            harvestDate: true,
            expiryDate: true,
          },
        },
      },
    });
    const inventoryIds = [
      ...new Set(items.map((item) => item.batch.inventoryId)),
    ].sort();
    if (inventoryIds.length === 0) {
      throw new BadRequestException('Chuyến hàng không có lô để hoàn kho');
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "inventories" WHERE "id" IN (${Prisma.join(
        inventoryIds.map((id) => Prisma.sql`${id}::uuid`),
      )}) ORDER BY "id" FOR UPDATE`,
    );
    const quantityByInventory = new Map<string, number>();
    for (const item of items) {
      const returnedBatch = await tx.inventoryBatch.create({
        data: {
          inventoryId: item.batch.inventoryId,
          batchNumber: `${item.batch.batchNumber}-RET-${shipment.id.slice(0, 8).toUpperCase()}`,
          quantity: item.quantity,
          initialQuantity: item.quantity,
          declaredQuantity: item.quantity,
          declarationIdempotencyKey: `return-${shipment.id}-${item.batch.id}`,
          lifecycleStatus: 'QUARANTINED',
          parentBatchId: item.batch.id,
          actualReceivedAt: receivedAt,
          manufactureDate: item.batch.manufactureDate,
          harvestDate: item.batch.harvestDate,
          expiryDate: item.batch.expiryDate,
          receivedDate: receivedAt,
          supplier: `Hoàn từ chuyến ${shipment.shipmentNumber}`,
          warehouseLocation: 'RETURN-QUARANTINE',
          status: BatchStatus.ACTIVE,
          qualityStatus: QualityStatus.QUARANTINE,
        },
      });
      await tx.stockMovement.create({
        data: {
          inventoryId: item.batch.inventoryId,
          batchId: returnedBatch.id,
          movementType: 'RETURN',
          quantity: item.quantity,
          beforeQuantity: 0,
          afterQuantity: item.quantity,
          referenceId: shipment.id,
          referenceType: 'SHIPMENT_RETURN',
          note: `Hàng hoàn được nhập lô cách ly từ ${shipment.shipmentNumber}; phải kiểm định trước khi bán lại`,
          createdById: actorId,
        },
      });
      quantityByInventory.set(
        item.batch.inventoryId,
        (quantityByInventory.get(item.batch.inventoryId) ?? 0) + item.quantity,
      );
    }
    for (const [inventoryId, quantity] of quantityByInventory) {
      await tx.inventory.update({
        where: { id: inventoryId },
        data: { currentQuantity: { increment: quantity } },
      });
    }
  }

  private async createEvent(
    tx: Prisma.TransactionClient,
    input: {
      shipmentId: string;
      idempotencyKey: string;
      eventType: ShipmentEventType;
      fromStatus: ShipmentStatus | null;
      toStatus: ShipmentStatus;
      actorId?: string;
      eventTime: Date;
      location?: string;
      latitude?: number;
      longitude?: number;
      recipientName?: string;
      failureReason?: string;
      note?: string;
      imageUrls?: string[];
      attachmentUrls?: string[];
      metadata?: Prisma.InputJsonValue;
      ipAddress?: string;
      source?: ShipmentEventSource;
    },
  ) {
    await tx.shipmentEvent.create({
      data: {
        ...input,
        idempotencyKey: input.idempotencyKey.trim(),
        source: input.source ?? ShipmentEventSource.INTERNAL,
        imageUrls: input.imageUrls ?? [],
        attachmentUrls: input.attachmentUrls ?? [],
      },
    });
  }

  private async syncOrderStatus(
    tx: Prisma.TransactionClient,
    orderId: string | null,
    shipmentStatus: ShipmentStatus,
    context: { shipmentId: string; actorId?: string | null },
  ) {
    if (!orderId) return;
    const shipment = await tx.shipment.findUnique({
      where: { id: context.shipmentId },
      select: {
        shipmentNumber: true,
        trackingCode: true,
        carrierOrganization: { select: { name: true } },
      },
    });
    const carrierName = shipment?.carrierOrganization.name ?? 'hãng vận chuyển';
    const shipmentRef = shipment?.shipmentNumber
      ? `Chuyến ${shipment.shipmentNumber}`
      : 'Chuyến hàng';
    const trackingRef = shipment?.trackingCode
      ? ` Mã vận đơn: ${shipment.trackingCode}.`
      : '';
    const inCarrierTransitStatuses: ShipmentStatus[] = [
      ShipmentStatus.HANDED_OVER,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.AT_DISTRIBUTOR,
      ShipmentStatus.AT_RETAIL,
      ShipmentStatus.OUT_FOR_DELIVERY,
    ];
    if (inCarrierTransitStatuses.includes(shipmentStatus)) {
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: {
            notIn: [
              OrderStatus.CANCELLED,
              OrderStatus.DELIVERED,
              OrderStatus.SHIPPED,
            ],
          },
        },
        data: { status: OrderStatus.SHIPPED },
      });
      if (updated.count > 0) {
        await tx.orderTracking.create({
          data: {
            orderId,
            status: OrderStatus.SHIPPED,
            description:
              `${shipmentRef} đã bàn giao/cập nhật bởi ${carrierName}.${trackingRef}`.trim(),
            changedById: context.actorId ?? null,
          },
        });
      }
      return;
    }
    if (shipmentStatus === ShipmentStatus.DELIVERED) {
      const [order, unfinished, activeReservations] = await Promise.all([
        tx.order.findUnique({
          where: { id: orderId },
          select: {
            status: true,
            paymentMethod: true,
            paymentAggregateId: true,
          },
        }),
        tx.shipment.count({
          where: {
            orderId,
            status: {
              notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
            },
          },
        }),
        tx.orderItemBatchReservation.count({
          where: {
            orderItem: { orderId },
            status: ReservationStatus.ACTIVE,
          },
        }),
      ]);
      if (
        order &&
        order.status !== OrderStatus.DELIVERED &&
        order.status !== OrderStatus.CANCELLED &&
        unfinished === 0 &&
        activeReservations === 0
      ) {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.DELIVERED,
            ...(order.paymentMethod === PaymentMethod.COD
              ? { paymentStatus: PaymentStatus.COMPLETED }
              : {}),
          },
        });
        await tx.orderTracking.create({
          data: {
            orderId,
            status: OrderStatus.DELIVERED,
            description:
              `${carrierName} xác nhận giao hàng thành công.${trackingRef}`.trim(),
            changedById: context.actorId ?? null,
          },
        });
        if (
          order.paymentMethod === PaymentMethod.COD &&
          order.paymentAggregateId
        ) {
          await this.completeCodAggregateIfReady(tx, order.paymentAggregateId);
        }
      }
      return;
    }
    if (shipmentStatus === ShipmentStatus.RETURNED) {
      const [order, unfinished] = await Promise.all([
        tx.order.findUnique({
          where: { id: orderId },
          select: { status: true },
        }),
        tx.shipment.count({
          where: {
            orderId,
            status: {
              notIn: [ShipmentStatus.RETURNED, ShipmentStatus.CANCELLED],
            },
          },
        }),
      ]);
      if (
        order &&
        order.status !== OrderStatus.RETURNED &&
        order.status !== OrderStatus.CANCELLED &&
        unfinished === 0
      ) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.RETURNED },
        });
        await tx.orderTracking.create({
          data: {
            orderId,
            status: OrderStatus.RETURNED,
            description:
              `${carrierName} xác nhận hoàn hàng về kho.${trackingRef}`.trim(),
            changedById: context.actorId ?? null,
          },
        });
      }
    }
  }

  private async completeCodAggregateIfReady(
    tx: Prisma.TransactionClient,
    paymentAggregateId: string,
  ) {
    const activeOrders = await tx.order.findMany({
      where: {
        paymentAggregateId,
        status: { not: OrderStatus.CANCELLED },
      },
      select: { status: true },
    });
    if (
      activeOrders.length > 0 &&
      activeOrders.every((order) =>
        (
          [OrderStatus.DELIVERED, OrderStatus.RETURNED] as OrderStatus[]
        ).includes(order.status),
      )
    ) {
      await tx.paymentAggregate.update({
        where: { id: paymentAggregateId },
        data: {
          status: PaymentAggregateStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }
  }
}
