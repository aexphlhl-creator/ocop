import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryRepository } from './inventory.repository';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName, Prisma } from '@prisma/client';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockAdjustDto } from './dto/stock-adjust.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import { GetInventoryQueryDto, GetMovementQueryDto } from './dto/get-inventory-query.dto';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  // ── Warehouse ──────────────────────────────────────────────────────────────

  async createWarehouse(dto: CreateWarehouseDto, currentUser: RequestUser) {
    let businessId: string | undefined;

    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({ where: { userId: currentUser.id } });
      if (business) businessId = business.id;
    }

    // Check name uniqueness within tenant
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        name: dto.name,
        businessId: businessId || null,
      }
    });

    if (existing) {
      throw new BadRequestException('Warehouse name already exists in your business');
    }

    // Generate Warehouse Code (e.g. WH-000001)
    const count = await this.prisma.warehouse.count();
    const generatedCode = `WH-${String(count + 1).padStart(6, '0')}`;

    const data: any = {
      code: generatedCode,
      name: dto.name,
      address: dto.address,
      formattedAddress: dto.formattedAddress,
      description: dto.description,
      latitude: dto.latitude,
      longitude: dto.longitude,
      type: dto.type,
      business: businessId ? { connect: { id: businessId } } : undefined,
    };
    
    // If SELLER creates warehouse, auto-assign themselves as manager if no managerId provided
    if (currentUser.role === RoleName.SELLER && !dto.managerId) {
      data.manager = { connect: { id: currentUser.id } };
    } else if (dto.managerId) {
      data.manager = { connect: { id: dto.managerId } };
    }
    return this.inventoryRepository.createWarehouse(data);
  }

  async getWarehouses(currentUser: RequestUser) {
    let businessId: string | undefined;
    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({ where: { userId: currentUser.id } });
      if (business) businessId = business.id;
    }
    return this.prisma.warehouse.findMany({
      where: {
        businessId: businessId || undefined,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async deleteWarehouse(id: string, currentUser: RequestUser) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { _count: { select: { inventories: true } } }
    });

    if (!warehouse) throw new NotFoundException('Warehouse not found');

    if (currentUser.role === RoleName.SELLER) {
      const business = await this.prisma.business.findFirst({ where: { userId: currentUser.id } });
      if (warehouse.businessId !== business?.id && warehouse.managerId !== currentUser.id) {
        throw new ForbiddenException('You do not have permission to delete this warehouse');
      }
    }

    if (warehouse._count.inventories > 0) {
      throw new BadRequestException('Cannot delete warehouse because it currently holds inventory. Please empty the warehouse first.');
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false }
    });
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async createInventory(dto: CreateInventoryDto, currentUser: RequestUser) {
    // Verify warehouse ownership for SELLER
    if (currentUser.role === RoleName.SELLER) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        include: { business: true },
      });
      if (!product || product.business.userId !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu sản phẩm này');
      }
    }

    const existing = await this.inventoryRepository.findInventoryByWarehouseAndProduct(dto.warehouseId, dto.productId);
    if (existing) {
      throw new BadRequestException('Sản phẩm này đã có bản ghi tồn kho trong kho được chọn');
    }

    return this.inventoryRepository.createInventory({
      warehouse: { connect: { id: dto.warehouseId } },
      product: { connect: { id: dto.productId } },
      minimumQuantity: dto.minimumQuantity ?? 0,
    });
  }

  async getInventories(query: GetInventoryQueryDto, currentUser: RequestUser) {
    const managerUserId = currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    const { items, total } = await this.inventoryRepository.findInventories({
      warehouseId: query.warehouseId,
      productId: query.productId,
      search: query.search,
      page: query.page,
      limit: query.limit,
      managerUserId,
    });
    return createPaginationResponse(items, total, query.page, query.limit);
  }

  async getInventoryById(id: string, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(id);
    if (!inventory) throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    if (currentUser.role === RoleName.SELLER) {
      const businessUserId = (inventory.product as any).business?.userId;
      if (businessUserId !== currentUser.id) {
        throw new ForbiddenException('Bạn không có quyền xem tồn kho này');
      }
    }
    return inventory;
  }

  async getBatches(inventoryId: string, currentUser: RequestUser) {
    await this.getInventoryById(inventoryId, currentUser); // Also validates ownership
    return this.inventoryRepository.findBatchesByInventory(inventoryId);
  }

  async getLowStock(currentUser: RequestUser) {
    const managerUserId = currentUser.role === RoleName.SELLER ? currentUser.id : undefined;

    const inventories = await this.prisma.inventory.findMany({
      where: {
        minimumQuantity: { gt: 0 },
        ...(managerUserId ? { warehouse: { managerId: managerUserId } } : {}),
      },
      include: {
        warehouse: true,
        product: { include: { images: { take: 1 } } },
      },
    });

    // Filter where currentQuantity <= minimumQuantity (Prisma can't compare columns directly)
    return inventories.filter(inv => inv.currentQuantity <= inv.minimumQuantity);
  }

  async getExpiring(daysAhead = 30, currentUser: RequestUser) {
    const managerUserId = currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    return this.inventoryRepository.findExpiringBatches(daysAhead, managerUserId);
  }

  async getStats(currentUser: RequestUser) {
    const managerUserId = currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    return this.inventoryRepository.getStats(managerUserId);
  }

  async getMovementHistory(query: GetMovementQueryDto, currentUser: RequestUser, inventoryId?: string) {
    const managerUserId = currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    const { items, total } = await this.inventoryRepository.findMovements({
      inventoryId,
      movementType: query.movementType,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      page: query.page,
      limit: query.limit,
      managerUserId,
    });
    return createPaginationResponse(items, total, query.page, query.limit);
  }

  // ── Stock In ───────────────────────────────────────────────────────────────

  async stockIn(dto: StockInDto, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(dto.inventoryId);
    if (!inventory) throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    if (currentUser.role === RoleName.SELLER) {
      const businessUserId = (inventory.product as any).business?.userId;
      if (businessUserId !== currentUser.id) {
        throw new ForbiddenException('Bạn không có quyền nhập kho này');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Auto-generate batch number: YYYYMMDD-PRODUCTCODE-SEQ
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const productCode = inventory.product.name.substring(0, 5).toUpperCase().replace(/\s/g, '');
      const existingCount = await tx.inventoryBatch.count({ where: { inventoryId: dto.inventoryId } });
      const seq = String(existingCount + 1).padStart(3, '0');
      const batchNumber = `${today}-${productCode}-${seq}`;

      // Create batch
      const batch = await tx.inventoryBatch.create({
        data: {
          inventory: { connect: { id: dto.inventoryId } },
          batchNumber,
          quantity: dto.quantity,
          initialQuantity: dto.quantity,
          supplier: dto.supplier,
          harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
          manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          warehouseLocation: dto.warehouseLocation,
        },
      });

      const beforeQuantity = inventory.currentQuantity;
      const afterQuantity = beforeQuantity + dto.quantity;

      // Update inventory quantity
      await tx.inventory.update({
        where: { id: dto.inventoryId },
        data: { currentQuantity: afterQuantity },
      });

      // Write audit movement
      const movement = await tx.stockMovement.create({
        data: {
          inventory: { connect: { id: dto.inventoryId } },
          batch: { connect: { id: batch.id } },
          movementType: 'IN',
          quantity: dto.quantity,
          beforeQuantity,
          afterQuantity,
          referenceId: dto.referenceId,
          referenceType: 'PURCHASE',
          note: dto.note,
          createdBy: { connect: { id: currentUser.id } },
        },
      });

      this.logger.log(`Stock IN: Inventory ${dto.inventoryId}, Batch ${batchNumber}, +${dto.quantity}`);
      return { batch, movement, inventory: { ...inventory, currentQuantity: afterQuantity } };
    });
  }

  // ── Stock Out (FIFO) ───────────────────────────────────────────────────────

  async stockOut(dto: StockOutDto, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(dto.inventoryId);
    if (!inventory) throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    if (currentUser.role === RoleName.SELLER) {
      const businessUserId = (inventory.product as any).business?.userId;
      if (businessUserId !== currentUser.id) {
        throw new ForbiddenException('Bạn không có quyền xuất kho này');
      }
    }

    // Available = current - reserved
    const available = inventory.currentQuantity - inventory.reservedQuantity;
    if (available < dto.quantity) {
      throw new BadRequestException(
        `Tồn kho khả dụng không đủ. Khả dụng: ${available}, Yêu cầu: ${dto.quantity}`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const batches = await tx.inventoryBatch.findMany({
        where: { inventoryId: dto.inventoryId, status: 'ACTIVE', quantity: { gt: 0 } },
        orderBy: { receivedDate: 'asc' }, // FIFO
      });

      let remaining = dto.quantity;
      const movements: any[] = [];
      const beforeTotal = inventory.currentQuantity;

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

        const movBefore = batch.quantity;
        const movAfter = newBatchQty;

        const mv = await tx.stockMovement.create({
          data: {
            inventory: { connect: { id: dto.inventoryId } },
            batch: { connect: { id: batch.id } },
            movementType: 'OUT',
            quantity: -deduct,
            beforeQuantity: movBefore,
            afterQuantity: movAfter,
            referenceId: dto.referenceId,
            referenceType: dto.referenceType ?? 'MANUAL',
            note: dto.note,
            createdBy: { connect: { id: currentUser.id } },
          },
        });

        movements.push(mv);
        remaining -= deduct;
      }

      if (remaining > 0) {
        throw new BadRequestException('Không đủ hàng trong các lô để thực hiện xuất kho');
      }

      const afterTotal = beforeTotal - dto.quantity;
      await tx.inventory.update({
        where: { id: dto.inventoryId },
        data: { currentQuantity: afterTotal },
      });

      this.logger.log(`Stock OUT (FIFO): Inventory ${dto.inventoryId}, -${dto.quantity}, from ${movements.length} batches`);
      return { movements, updatedQuantity: afterTotal };
    });
  }

  // ── Adjust ─────────────────────────────────────────────────────────────────

  async stockAdjust(dto: StockAdjustDto, currentUser: RequestUser) {
    if (currentUser.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới có thể điều chỉnh kiểm kê');
    }

    const inventory = await this.inventoryRepository.findInventoryById(dto.inventoryId);
    if (!inventory) throw new NotFoundException('Không tìm thấy bản ghi tồn kho');

    if (dto.newQuantity < 0) throw new BadRequestException('Tồn kho không được âm');

    const beforeQuantity = inventory.currentQuantity;
    const delta = dto.newQuantity - beforeQuantity;

    return this.prisma.$transaction(async (tx) => {
      await tx.inventory.update({
        where: { id: dto.inventoryId },
        data: { currentQuantity: dto.newQuantity },
      });

      const movement = await tx.stockMovement.create({
        data: {
          inventory: { connect: { id: dto.inventoryId } },
          movementType: 'ADJUSTMENT',
          quantity: delta,
          beforeQuantity,
          afterQuantity: dto.newQuantity,
          reason: dto.reason,
          note: dto.note,
          createdBy: { connect: { id: currentUser.id } },
        },
      });

      this.logger.log(`Stock ADJUSTMENT: Inventory ${dto.inventoryId}, ${beforeQuantity} → ${dto.newQuantity}`);
      return { movement, updatedQuantity: dto.newQuantity };
    });
  }

  // ── Transfer ───────────────────────────────────────────────────────────────

  async stockTransfer(dto: StockTransferDto, currentUser: RequestUser) {
    const [fromInv, toInv] = await Promise.all([
      this.inventoryRepository.findInventoryById(dto.fromInventoryId),
      this.inventoryRepository.findInventoryById(dto.toInventoryId),
    ]);

    if (!fromInv) throw new NotFoundException('Không tìm thấy kho nguồn');
    if (!toInv) throw new NotFoundException('Không tìm thấy kho đích');

    if (currentUser.role === RoleName.SELLER) {
      const businessUserFrom = (fromInv.product as any).business?.userId;
      const businessUserTo = (toInv.product as any).business?.userId;
      if (businessUserFrom !== currentUser.id || businessUserTo !== currentUser.id) {
        throw new ForbiddenException('Bạn không có quyền chuyển hàng giữa các kho này');
      }
    }
    if (fromInv.productId !== toInv.productId) {
      throw new BadRequestException('Chỉ có thể chuyển hàng cùng một loại sản phẩm');
    }
    if (fromInv.currentQuantity < dto.quantity) {
      throw new BadRequestException('Kho nguồn không đủ hàng để chuyển');
    }

    return this.prisma.$transaction(async (tx) => {
      const beforeFrom = fromInv.currentQuantity;
      const afterFrom = beforeFrom - dto.quantity;
      const beforeTo = toInv.currentQuantity;
      const afterTo = beforeTo + dto.quantity;

      await tx.inventory.update({ where: { id: dto.fromInventoryId }, data: { currentQuantity: afterFrom } });
      await tx.inventory.update({ where: { id: dto.toInventoryId }, data: { currentQuantity: afterTo } });

      // OUT from source
      await tx.stockMovement.create({
        data: {
          inventory: { connect: { id: dto.fromInventoryId } },
          movementType: 'TRANSFER',
          quantity: -dto.quantity,
          beforeQuantity: beforeFrom,
          afterQuantity: afterFrom,
          toInventoryId: dto.toInventoryId,
          reason: dto.reason,
          note: dto.note,
          createdBy: { connect: { id: currentUser.id } },
        },
      });
      // IN to destination
      await tx.stockMovement.create({
        data: {
          inventory: { connect: { id: dto.toInventoryId } },
          movementType: 'TRANSFER',
          quantity: dto.quantity,
          beforeQuantity: beforeTo,
          afterQuantity: afterTo,
          reason: dto.reason,
          note: dto.note,
          createdBy: { connect: { id: currentUser.id } },
        },
      });

      this.logger.log(`Stock TRANSFER: ${dto.fromInventoryId} → ${dto.toInventoryId}, qty=${dto.quantity}`);
      return { fromQuantity: afterFrom, toQuantity: afterTo };
    });
  }

  async updateMinimumQuantity(id: string, minimumQuantity: number, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(id);
    if (!inventory) throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    if (currentUser.role === RoleName.SELLER) {
      const businessUserId = (inventory.product as any).business?.userId;
      if (businessUserId !== currentUser.id) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa kho này');
      }
    }
    return this.inventoryRepository.updateMinimumQuantity(id, minimumQuantity);
  }
}
