import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, MovementType } from '@prisma/client';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Warehouse ──────────────────────────────────────────────────────────────

  async createWarehouse(data: Prisma.WarehouseCreateInput) {
    return this.prisma.warehouse.create({
      data,
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            sellerProfile: { select: { displayName: true, isVerified: true } },
          },
        },
        manager: { select: { id: true, fullName: true } },
      },
    });
  }

  async findWarehouses(managerId?: string) {
    return this.prisma.warehouse.findMany({
      where: managerId ? { managerId } : undefined,
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            sellerProfile: { select: { displayName: true, isVerified: true } },
          },
        },
        manager: { select: { id: true, fullName: true } },
        _count: { select: { inventories: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findWarehouseById(id: string) {
    return this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            sellerProfile: { select: { displayName: true, isVerified: true } },
          },
        },
        manager: { select: { id: true, fullName: true } },
      },
    });
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async createInventory(data: Prisma.InventoryCreateInput) {
    return this.prisma.inventory.create({
      data,
      include: {
        warehouse: true,
        product: {
          include: {
            images: { take: 1 },
            seller: { select: { id: true } },
          },
        },
      },
    });
  }

  async findInventories(params: {
    warehouseId?: string;
    productId?: string;
    search?: string;
    page: number;
    limit: number;
    sellerOwnerId?: string;
    warehouseManagerId?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const filters: Prisma.InventoryWhereInput[] = [];

    if (params.warehouseId) filters.push({ warehouseId: params.warehouseId });
    if (params.productId) filters.push({ productId: params.productId });
    if (params.sellerOwnerId) {
      filters.push({
        product: { sellerId: params.sellerOwnerId },
      });
    }
    if (params.warehouseManagerId) {
      filters.push({
        warehouse: { managerId: params.warehouseManagerId },
      });
    }
    if (params.search) {
      filters.push({
        product: { name: { contains: params.search, mode: 'insensitive' } },
      });
    }
    const where: Prisma.InventoryWhereInput =
      filters.length > 0 ? { AND: filters } : {};

    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          warehouse: true,
          product: {
            include: {
              images: { take: 1 },
              seller: { select: { id: true } },
            },
          },
          _count: { select: { batches: true } },
          batches: {
            where: {
              status: 'ACTIVE',
              lifecycleStatus: 'RELEASED',
              qualityStatus: 'PASSED',
              OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
            },
            select: { quantity: true },
          },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return {
      items: items.map(({ batches, ...inventory }) => ({
        ...inventory,
        availableQuantity: Math.max(
          batches.reduce((sum, batch) => sum + batch.quantity, 0) -
            inventory.reservedQuantity,
          0,
        ),
      })),
      total,
    };
  }

  async findInventoryById(id: string) {
    return this.prisma.inventory.findUnique({
      where: { id },
      include: {
        warehouse: true,
        product: {
          include: {
            images: { take: 1 },
            seller: { select: { id: true } },
          },
        },
        batches: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async findInventoryByWarehouseAndProduct(
    warehouseId: string,
    productId: string,
  ) {
    return this.prisma.inventory.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
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
    return this.prisma.inventory.update({
      where: { id },
      data: { minimumQuantity },
    });
  }

  // Low-stock: returns all with minimumQuantity > 0, service will filter
  async findLowStockInventories(sellerOwnerId?: string) {
    return this.prisma.inventory.findMany({
      where: {
        minimumQuantity: { gt: 0 },
        ...(sellerOwnerId ? { product: { sellerId: sellerOwnerId } } : {}),
      },
      include: {
        warehouse: true,
        product: {
          include: {
            images: { take: 1 },
            seller: { select: { id: true } },
          },
        },
      },
    });
  }

  // ── Batch ──────────────────────────────────────────────────────────────────

  async createBatch(
    data: Prisma.InventoryBatchCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
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

  async updateBatch(
    id: string,
    data: Prisma.InventoryBatchUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.inventoryBatch.update({ where: { id }, data });
  }

  async countBatchByNumber(inventoryId: string, batchNumber: string) {
    return this.prisma.inventoryBatch.count({
      where: { inventoryId, batchNumber },
    });
  }

  // Batches expiring within `daysAhead` days
  async findExpiringBatches(
    daysAhead: number,
    sellerOwnerId?: string,
    warehouseManagerId?: string,
  ) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    return this.prisma.inventoryBatch.findMany({
      where: {
        expiryDate: { lte: cutoff, gte: new Date() },
        status: 'ACTIVE',
        ...(sellerOwnerId
          ? {
              inventory: {
                product: { sellerId: sellerOwnerId },
              },
            }
          : {}),
        ...(warehouseManagerId
          ? { inventory: { warehouse: { managerId: warehouseManagerId } } }
          : {}),
      },
      include: {
        inventory: {
          include: {
            warehouse: true,
            product: {
              include: {
                images: { take: 1 },
                seller: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  // ── StockMovement ──────────────────────────────────────────────────────────

  async createMovement(
    data: Prisma.StockMovementCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.stockMovement.create({
      data,
      include: {
        batch: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findMovements(params: {
    inventoryId?: string;
    movementType?: MovementType;
    fromDate?: Date;
    toDate?: Date;
    page: number;
    limit: number;
    sellerOwnerId?: string;
    warehouseManagerId?: string;
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
    if (params.sellerOwnerId) {
      where.inventory = {
        product: { sellerId: params.sellerOwnerId },
      };
    }
    if (params.warehouseManagerId) {
      where.inventory = {
        warehouse: { managerId: params.warehouseManagerId },
      };
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

  async getStats(sellerOwnerId?: string, warehouseManagerId?: string) {
    const inventoryWhere: Prisma.InventoryWhereInput | undefined = sellerOwnerId
      ? { product: { sellerId: sellerOwnerId } }
      : warehouseManagerId
        ? { warehouse: { managerId: warehouseManagerId } }
        : undefined;

    const [totalSKUs, totalQuantity, lowStockCount, expiringCount] =
      await Promise.all([
        this.prisma.inventory.count({ where: inventoryWhere }),
        this.prisma.inventory.aggregate({
          _sum: { currentQuantity: true },
          where: inventoryWhere,
        }),
        this.prisma.inventory.count({
          where: {
            minimumQuantity: { gt: 0 },
            currentQuantity: { lte: 0 },
            ...inventoryWhere,
          },
        }),
        this.prisma.inventoryBatch.count({
          where: {
            status: 'ACTIVE',
            expiryDate: { lte: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
            ...(inventoryWhere ? { inventory: inventoryWhere } : {}),
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
