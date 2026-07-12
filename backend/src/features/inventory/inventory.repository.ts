import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, MovementType } from '@prisma/client';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Warehouse ──────────────────────────────────────────────────────────────

  async createWarehouse(data: Prisma.WarehouseCreateInput) {
    return this.prisma.warehouse.create({ data, include: { manager: { select: { id: true, fullName: true } } } });
  }

  async findWarehouses(managerId?: string) {
    return this.prisma.warehouse.findMany({
      where: managerId ? { managerId } : undefined,
      include: {
        manager: { select: { id: true, fullName: true } },
        _count: { select: { inventories: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findWarehouseById(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id }, include: { manager: { select: { id: true, fullName: true } } } });
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async createInventory(data: Prisma.InventoryCreateInput) {
    return this.prisma.inventory.create({
      data,
      include: { warehouse: true, product: { include: { images: { take: 1 }, business: { select: { userId: true } } } } },
    });
  }

  async findInventories(params: {
    warehouseId?: string;
    productId?: string;
    search?: string;
    page: number;
    limit: number;
    managerUserId?: string; // For SELLER scoping
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: Prisma.InventoryWhereInput = {};

    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.productId) where.productId = params.productId;
    if (params.managerUserId) {
      where.product = {
        ...((where.product as any) || {}),
        business: { userId: params.managerUserId },
      };
    }
    if (params.search) {
      where.product = {
        ...((where.product as any) || {}),
        name: { contains: params.search, mode: 'insensitive' },
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          warehouse: true,
          product: { include: { images: { take: 1 }, business: { select: { userId: true } } } },
          _count: { select: { batches: true } },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { items, total };
  }

  async findInventoryById(id: string) {
    return this.prisma.inventory.findUnique({
      where: { id },
      include: {
        warehouse: true,
        product: { include: { images: { take: 1 }, business: { select: { userId: true } } } },
        batches: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async findInventoryByWarehouseAndProduct(warehouseId: string, productId: string) {
    return this.prisma.inventory.findUnique({ where: { warehouseId_productId: { warehouseId, productId } } });
  }

  async updateInventoryQuantities(
    id: string,
    currentQuantity: number,
    reservedQuantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.inventory.update({
      where: { id },
      data: { currentQuantity, reservedQuantity },
    });
  }

  async updateMinimumQuantity(id: string, minimumQuantity: number) {
    return this.prisma.inventory.update({ where: { id }, data: { minimumQuantity } });
  }

  // Low-stock: returns all with minimumQuantity > 0, service will filter
  async findLowStockInventories(managerUserId?: string) {
    return this.prisma.inventory.findMany({
      where: {
        minimumQuantity: { gt: 0 },
        ...(managerUserId ? { product: { business: { userId: managerUserId } } } : {}),
      },
      include: { warehouse: true, product: { include: { images: { take: 1 }, business: { select: { userId: true } } } } },
    });
  }

  // ── Batch ──────────────────────────────────────────────────────────────────

  async createBatch(data: Prisma.InventoryBatchCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.inventoryBatch.create({ data });
  }

  async findBatchesByInventory(inventoryId: string) {
    return this.prisma.inventoryBatch.findMany({
      where: { inventoryId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // FIFO: oldest ACTIVE batches first
  async findActiveBatchesFIFO(inventoryId: string) {
    return this.prisma.inventoryBatch.findMany({
      where: { inventoryId, status: 'ACTIVE', quantity: { gt: 0 } },
      orderBy: { receivedDate: 'asc' }, // FIFO by received date
    });
  }

  async updateBatch(id: string, data: Prisma.InventoryBatchUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.inventoryBatch.update({ where: { id }, data });
  }

  async countBatchByNumber(inventoryId: string, batchNumber: string) {
    return this.prisma.inventoryBatch.count({ where: { inventoryId, batchNumber } });
  }

  // Batches expiring within `daysAhead` days
  async findExpiringBatches(daysAhead: number, managerUserId?: string) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    return this.prisma.inventoryBatch.findMany({
      where: {
        expiryDate: { lte: cutoff, gte: new Date() },
        status: 'ACTIVE',
        ...(managerUserId ? { inventory: { product: { business: { userId: managerUserId } } } } : {}),
      },
      include: {
        inventory: { include: { warehouse: true, product: { include: { images: { take: 1 }, business: { select: { userId: true } } } } } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  // ── StockMovement ──────────────────────────────────────────────────────────

  async createMovement(data: Prisma.StockMovementCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.stockMovement.create({ data, include: { batch: true, createdBy: { select: { id: true, fullName: true } } } });
  }

  async findMovements(params: {
    inventoryId?: string;
    movementType?: MovementType;
    fromDate?: Date;
    toDate?: Date;
    page: number;
    limit: number;
    managerUserId?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: Prisma.StockMovementWhereInput = {};

    if (params.inventoryId) where.inventoryId = params.inventoryId;
    if (params.movementType) where.movementType = params.movementType;
    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }
    if (params.managerUserId) {
      where.inventory = { product: { business: { userId: params.managerUserId } } };
    }

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          inventory: { include: { warehouse: true, product: true } },
          batch: true,
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total };
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(managerUserId?: string) {
    const warehouseWhere = managerUserId
      ? { warehouse: { managerId: managerUserId } }
      : undefined;

    const [totalSKUs, totalQuantity, lowStockCount, expiringCount] = await Promise.all([
      this.prisma.inventory.count({ where: warehouseWhere }),
      this.prisma.inventory.aggregate({ _sum: { currentQuantity: true }, where: warehouseWhere }),
      this.prisma.inventory.count({
        where: { minimumQuantity: { gt: 0 }, currentQuantity: { lte: 0 }, ...warehouseWhere },
      }),
      this.prisma.inventoryBatch.count({
        where: {
          status: 'ACTIVE',
          expiryDate: { lte: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
          ...(managerUserId ? { inventory: { warehouse: { managerId: managerUserId } } } : {}),
        },
      }),
    ]);

    return {
      totalSKUs,
      totalQuantity: totalQuantity._sum.currentQuantity ?? 0,
      lowStockCount,
      expiringCount,
    };
  }
}
