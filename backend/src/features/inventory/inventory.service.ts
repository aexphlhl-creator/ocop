import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryRepository } from './inventory.repository';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import {
  BatchLifecycleStatus,
  BatchStatus,
  QualityStatus,
  RoleName,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockAdjustDto } from './dto/stock-adjust.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import {
  GetInventoryQueryDto,
  GetMovementQueryDto,
} from './dto/get-inventory-query.dto';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  private assertInventoryAccess(
    inventory: {
      warehouse: { managerId: string | null };
      product: { sellerId: string };
    },
    currentUser: RequestUser,
    message: string,
  ) {
    if (
      currentUser.role === RoleName.SELLER &&
      inventory.product.sellerId !== currentUser.id
    ) {
      throw new ForbiddenException(message);
    }

    if (
      currentUser.role === RoleName.WAREHOUSE_MANAGER &&
      inventory.warehouse.managerId !== currentUser.id
    ) {
      throw new ForbiddenException(message);
    }
  }

  // ── Warehouse ──────────────────────────────────────────────────────────────

  async createWarehouse(dto: CreateWarehouseDto, currentUser: RequestUser) {
    if (currentUser.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới có thể tạo kho');
    }
    const sellerId = dto.sellerId;

    if (!sellerId) {
      throw new BadRequestException(
        'Kho vận hành phải thuộc một SELLER. Vui lòng chọn người bán sở hữu kho',
      );
    }

    const seller = await this.prisma.user.findFirst({
      where: { id: sellerId, isActive: true, role: { name: RoleName.SELLER } },
      select: { id: true, sellerProfile: { select: { isVerified: true } } },
    });
    if (!seller) throw new BadRequestException('Tài khoản SELLER không hợp lệ');
    if (!seller.sellerProfile?.isVerified) {
      throw new BadRequestException(
        'SELLER phải được xác minh hồ sơ trước khi được cấp kho',
      );
    }

    // Check name uniqueness within tenant
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        name: dto.name,
        sellerId: sellerId || null,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Tên kho đã tồn tại trong phạm vi người bán này',
      );
    }

    if (dto.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        select: { isActive: true, role: { select: { name: true } } },
      });
      if (
        !manager?.isActive ||
        manager.role.name !== RoleName.WAREHOUSE_MANAGER
      ) {
        throw new BadRequestException(
          'Chỉ tài khoản WAREHOUSE_MANAGER đang hoạt động mới được quản lý kho',
        );
      }
    }

    // A row count is not a sequence: simultaneous requests used to collide.
    const generatedCode = `WH-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

    const data: Prisma.WarehouseCreateInput = {
      code: generatedCode,
      name: dto.name,
      address: dto.address,
      formattedAddress: dto.formattedAddress,
      description: dto.description,
      latitude: dto.latitude,
      longitude: dto.longitude,
      type: dto.type,
      seller: { connect: { id: sellerId } },
    };

    if (dto.managerId) {
      data.manager = { connect: { id: dto.managerId } };
    }
    return this.inventoryRepository.createWarehouse(data);
  }

  private warehouseOwnerInclude() {
    return {
      seller: {
        select: {
          id: true,
          fullName: true,
          email: true,
          sellerProfile: {
            select: {
              displayName: true,
              isVerified: true,
            },
          },
        },
      },
      manager: {
        select: { id: true, fullName: true, email: true, phone: true },
      },
      _count: {
        select: {
          inventories: true,
          purchaseOrders: true,
          goodsReceipts: true,
          outboundShipments: true,
          inboundShipments: true,
        },
      },
    } satisfies Prisma.WarehouseInclude;
  }

  async getWarehouses(currentUser: RequestUser) {
    if (currentUser.role === RoleName.WAREHOUSE_MANAGER) {
      return this.prisma.warehouse.findMany({
        where: { managerId: currentUser.id, isActive: true },
        include: this.warehouseOwnerInclude(),
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.warehouse.findMany({
      where: {
        sellerId:
          currentUser.role === RoleName.SELLER ? currentUser.id : undefined,
        isActive: true,
      },
      include: this.warehouseOwnerInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateWarehouse(
    id: string,
    dto: UpdateWarehouseDto,
    currentUser: RequestUser,
  ) {
    if (currentUser.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Chỉ Admin được cập nhật thông tin kho');
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            inventories: true,
            purchaseOrders: true,
            goodsReceipts: true,
            outboundShipments: true,
            inboundShipments: true,
          },
        },
      },
    });
    if (!warehouse?.isActive) {
      throw new NotFoundException('Warehouse not found');
    }

    const name = dto.name?.trim();
    const address = dto.address?.trim();
    const targetSellerId = dto.sellerId ?? warehouse.sellerId;
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Tên kho không được trống');
    }
    if (dto.address !== undefined && !address) {
      throw new BadRequestException('Địa chỉ không được để trống');
    }

    if (
      (name && name !== warehouse.name) ||
      (dto.sellerId !== undefined && dto.sellerId !== warehouse.sellerId)
    ) {
      const duplicate = await this.prisma.warehouse.findFirst({
        where: {
          id: { not: id },
          name: name ?? warehouse.name,
          sellerId: targetSellerId ?? null,
        },
      });
      if (duplicate) {
        throw new BadRequestException(
          'Tên kho đã tồn tại trong phạm vi người bán này',
        );
      }
    }

    if (dto.sellerId !== undefined && dto.sellerId !== warehouse.sellerId) {
      await this.assertWarehouseSellerCanChange(id, warehouse, dto.sellerId);
    }

    if (dto.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        select: { isActive: true, role: { select: { name: true } } },
      });
      if (
        !manager?.isActive ||
        manager.role.name !== RoleName.WAREHOUSE_MANAGER
      ) {
        throw new BadRequestException(
          'Chỉ tài khoản WAREHOUSE_MANAGER đang hoạt động mới được quản lý kho',
        );
      }
    }

    const data: Prisma.WarehouseUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address;
    if (dto.formattedAddress !== undefined) {
      data.formattedAddress = dto.formattedAddress;
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.sellerId !== undefined) {
      data.seller = { connect: { id: dto.sellerId } };
    }
    if (dto.managerId !== undefined) {
      data.manager = dto.managerId
        ? { connect: { id: dto.managerId } }
        : { disconnect: true };
    }

    return this.prisma.warehouse.update({
      where: { id },
      data,
      include: {
        ...this.warehouseOwnerInclude(),
      },
    });
  }

  private async assertWarehouseSellerCanChange(
    warehouseId: string,
    warehouse: {
      sellerId: string | null;
      _count: {
        inventories: number;
        purchaseOrders: number;
        goodsReceipts: number;
        outboundShipments: number;
        inboundShipments: number;
      };
    },
    targetSellerId: string,
  ) {
    const seller = await this.prisma.user.findFirst({
      where: {
        id: targetSellerId,
        isActive: true,
        role: { name: RoleName.SELLER },
      },
      select: { id: true, sellerProfile: { select: { isVerified: true } } },
    });
    if (!seller) throw new BadRequestException('Tài khoản SELLER không hợp lệ');
    if (!seller.sellerProfile?.isVerified) {
      throw new BadRequestException(
        'SELLER phải được xác minh hồ sơ trước khi được cấp kho',
      );
    }

    const hasOperationalReferences =
      warehouse._count.inventories > 0 ||
      warehouse._count.purchaseOrders > 0 ||
      warehouse._count.goodsReceipts > 0 ||
      warehouse._count.outboundShipments > 0 ||
      warehouse._count.inboundShipments > 0;

    if (!hasOperationalReferences) return;

    if (warehouse.sellerId) {
      throw new BadRequestException(
        'Kho đã phát sinh dữ liệu vận hành nên không thể đổi Seller sở hữu',
      );
    }

    const conflictingInventory = await this.prisma.inventory.findFirst({
      where: {
        warehouseId,
        product: { sellerId: { not: targetSellerId } },
      },
      select: { id: true },
    });
    if (conflictingInventory) {
      throw new BadRequestException(
        'Không thể gán kho legacy cho Seller này vì kho đang chứa sản phẩm của Seller khác',
      );
    }
  }

  async deleteWarehouse(id: string, currentUser: RequestUser) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { _count: { select: { inventories: true } } },
    });

    if (!warehouse) throw new NotFoundException('Warehouse not found');

    if (currentUser.role === RoleName.WAREHOUSE_MANAGER) {
      throw new ForbiddenException(
        'Quản lý kho không có quyền xóa kho được phân công',
      );
    }

    if (currentUser.role === RoleName.SELLER) {
      if (
        warehouse.sellerId !== currentUser.id &&
        warehouse.managerId !== currentUser.id
      ) {
        throw new ForbiddenException(
          'You do not have permission to delete this warehouse',
        );
      }
    }

    if (warehouse._count.inventories > 0) {
      throw new BadRequestException(
        'Cannot delete warehouse because it currently holds inventory. Please empty the warehouse first.',
      );
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async createInventory(dto: CreateInventoryDto, currentUser: RequestUser) {
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id: dto.productId, deletedAt: null },
        select: {
          id: true,
          sellerId: true,
          status: true,
          seller: {
            select: {
              isActive: true,
              sellerProfile: { select: { isVerified: true } },
            },
          },
        },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
        select: { sellerId: true, managerId: true, isActive: true },
      }),
    ]);

    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    if (!warehouse?.isActive)
      throw new NotFoundException('Kho không hoạt động');
    if (!warehouse.sellerId || warehouse.sellerId !== product.sellerId) {
      throw new BadRequestException(
        'Sản phẩm và kho phải thuộc cùng một SELLER đã xác định',
      );
    }
    if (
      product.status !== 'APPROVED' ||
      !product.seller.isActive ||
      !product.seller.sellerProfile?.isVerified
    ) {
      throw new BadRequestException(
        'Chỉ sản phẩm đã duyệt của SELLER đã xác minh mới được đưa vào kho',
      );
    }
    if (
      currentUser.role === RoleName.SELLER &&
      product.sellerId !== currentUser.id
    ) {
      throw new ForbiddenException('Bạn không sở hữu sản phẩm này');
    }
    if (
      currentUser.role === RoleName.WAREHOUSE_MANAGER &&
      warehouse.managerId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Bạn chỉ có thể thêm sản phẩm vào kho được phân công',
      );
    }

    const existing =
      await this.inventoryRepository.findInventoryByWarehouseAndProduct(
        dto.warehouseId,
        dto.productId,
      );
    if (existing) {
      throw new BadRequestException(
        'Sản phẩm này đã có bản ghi tồn kho trong kho được chọn',
      );
    }

    return this.inventoryRepository.createInventory({
      warehouse: { connect: { id: dto.warehouseId } },
      product: { connect: { id: dto.productId } },
      minimumQuantity: dto.minimumQuantity ?? 0,
    });
  }

  async getInventories(query: GetInventoryQueryDto, currentUser: RequestUser) {
    const sellerOwnerId =
      currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    const warehouseManagerId =
      currentUser.role === RoleName.WAREHOUSE_MANAGER
        ? currentUser.id
        : undefined;
    const { items, total } = await this.inventoryRepository.findInventories({
      warehouseId: query.warehouseId,
      productId: query.productId,
      search: query.search,
      page: query.page,
      limit: query.limit,
      sellerOwnerId,
      warehouseManagerId,
    });
    return createPaginationResponse(items, total, query.page, query.limit);
  }

  async getInventoryById(id: string, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(id);
    if (!inventory)
      throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    this.assertInventoryAccess(
      inventory,
      currentUser,
      'Bạn không có quyền xem tồn kho này',
    );
    return inventory;
  }

  async getBatches(inventoryId: string, currentUser: RequestUser) {
    await this.getInventoryById(inventoryId, currentUser); // Also validates ownership
    return this.inventoryRepository.findBatchesByInventory(inventoryId);
  }

  async getLowStock(currentUser: RequestUser) {
    const inventories = await this.prisma.inventory.findMany({
      where: {
        minimumQuantity: { gt: 0 },
        ...(currentUser.role === RoleName.SELLER
          ? { product: { sellerId: currentUser.id } }
          : {}),
        ...(currentUser.role === RoleName.WAREHOUSE_MANAGER
          ? { warehouse: { managerId: currentUser.id } }
          : {}),
      },
      include: {
        warehouse: true,
        product: { include: { images: { take: 1 } } },
      },
    });

    // Filter where currentQuantity <= minimumQuantity (Prisma can't compare columns directly)
    return inventories.filter(
      (inv) => inv.currentQuantity <= inv.minimumQuantity,
    );
  }

  async getExpiring(daysAhead = 30, currentUser: RequestUser) {
    const sellerOwnerId =
      currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    const warehouseManagerId =
      currentUser.role === RoleName.WAREHOUSE_MANAGER
        ? currentUser.id
        : undefined;
    return this.inventoryRepository.findExpiringBatches(
      daysAhead,
      sellerOwnerId,
      warehouseManagerId,
    );
  }

  async getStats(currentUser: RequestUser) {
    const sellerOwnerId =
      currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    const warehouseManagerId =
      currentUser.role === RoleName.WAREHOUSE_MANAGER
        ? currentUser.id
        : undefined;
    return this.inventoryRepository.getStats(sellerOwnerId, warehouseManagerId);
  }

  async getMovementHistory(
    query: GetMovementQueryDto,
    currentUser: RequestUser,
    inventoryId?: string,
  ) {
    const sellerOwnerId =
      currentUser.role === RoleName.SELLER ? currentUser.id : undefined;
    const warehouseManagerId =
      currentUser.role === RoleName.WAREHOUSE_MANAGER
        ? currentUser.id
        : undefined;
    const { items, total } = await this.inventoryRepository.findMovements({
      inventoryId,
      movementType: query.movementType,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      page: query.page,
      limit: query.limit,
      sellerOwnerId,
      warehouseManagerId,
    });
    return createPaginationResponse(items, total, query.page, query.limit);
  }

  // ── Stock In ───────────────────────────────────────────────────────────────

  async stockIn(dto: StockInDto, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(
      dto.inventoryId,
    );
    if (!inventory)
      throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    this.assertInventoryAccess(
      inventory,
      currentUser,
      'Bạn không có quyền nhập kho này',
    );

    return this.prisma.$transaction(async (tx) => {
      // Auto-generate batch number: YYYYMMDD-PRODUCTCODE-SEQ
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const productCode = inventory.product.name
        .substring(0, 5)
        .toUpperCase()
        .replace(/\s/g, '');
      const existingCount = await tx.inventoryBatch.count({
        where: { inventoryId: dto.inventoryId },
      });
      const seq = String(existingCount + 1).padStart(3, '0');
      const batchNumber = `${today}-${productCode}-${seq}`;

      // Create batch
      const batch = await tx.inventoryBatch.create({
        data: {
          inventory: { connect: { id: dto.inventoryId } },
          batchNumber,
          quantity: dto.quantity,
          initialQuantity: dto.quantity,
          declaredQuantity: dto.quantity,
          lifecycleStatus: BatchLifecycleStatus.QUARANTINED,
          declaredBy: { connect: { id: currentUser.id } },
          declarationIdempotencyKey: `legacy-stock-in-${randomUUID()}`,
          actualReceivedAt: new Date(),
          supplier: dto.supplier,
          harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
          manufactureDate: dto.manufactureDate
            ? new Date(dto.manufactureDate)
            : null,
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

      this.logger.log(
        `Stock IN: Inventory ${dto.inventoryId}, Batch ${batchNumber}, +${dto.quantity}`,
      );
      return {
        batch,
        movement,
        inventory: { ...inventory, currentQuantity: afterQuantity },
      };
    });
  }

  // ── Stock Out (FIFO) ───────────────────────────────────────────────────────

  async stockOut(dto: StockOutDto, currentUser: RequestUser) {
    const inventory = await this.inventoryRepository.findInventoryById(
      dto.inventoryId,
    );
    if (!inventory)
      throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    this.assertInventoryAccess(
      inventory,
      currentUser,
      'Bạn không có quyền xuất kho này',
    );

    // Available = current - reserved
    const available = inventory.currentQuantity - inventory.reservedQuantity;
    if (available < dto.quantity) {
      throw new BadRequestException(
        `Tồn kho khả dụng không đủ. Khả dụng: ${available}, Yêu cầu: ${dto.quantity}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const batches = await tx.inventoryBatch.findMany({
        where: {
          inventoryId: dto.inventoryId,
          status: 'ACTIVE',
          quantity: { gt: 0 },
          OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
        },
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
        throw new BadRequestException(
          'Không đủ hàng trong các lô để thực hiện xuất kho',
        );
      }

      const afterTotal = beforeTotal - dto.quantity;
      await tx.inventory.update({
        where: { id: dto.inventoryId },
        data: { currentQuantity: afterTotal },
      });

      this.logger.log(
        `Stock OUT (FIFO): Inventory ${dto.inventoryId}, -${dto.quantity}, from ${movements.length} batches`,
      );
      return { movements, updatedQuantity: afterTotal };
    });
  }

  // ── Adjust ─────────────────────────────────────────────────────────────────

  async stockAdjust(dto: StockAdjustDto, currentUser: RequestUser) {
    if (currentUser.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới có thể điều chỉnh kiểm kê');
    }

    const inventory = await this.inventoryRepository.findInventoryById(
      dto.inventoryId,
    );
    if (!inventory)
      throw new NotFoundException('Không tìm thấy bản ghi tồn kho');

    if (dto.newQuantity < 0)
      throw new BadRequestException('Tồn kho không được âm');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "inventories" WHERE "id" = ${dto.inventoryId}::uuid FOR UPDATE
      `;
      const currentInventory = await tx.inventory.findUnique({
        where: { id: dto.inventoryId },
      });
      if (!currentInventory)
        throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
      await tx.$queryRaw`
        SELECT "id" FROM "inventory_batches"
        WHERE "id" = ${dto.batchId}::uuid FOR UPDATE
      `;
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: dto.batchId },
        include: {
          orderItemReservations: {
            where: { status: 'ACTIVE' },
            select: { quantity: true },
          },
          shipmentItems: {
            where: {
              orderItemId: null,
              shipment: { status: { in: ['DRAFT', 'ASSIGNED'] } },
            },
            select: { quantity: true },
          },
        },
      });
      if (!batch || batch.inventoryId !== dto.inventoryId) {
        throw new BadRequestException(
          'Lô kiểm kê không thuộc inventory đã chọn',
        );
      }
      if (['DRAFT', 'SUBMITTED'].includes(batch.lifecycleStatus)) {
        throw new BadRequestException(
          'Lô chưa tiếp nhận không được điều chỉnh tồn vật lý',
        );
      }
      const allocated =
        batch.orderItemReservations.reduce(
          (sum, row) => sum + row.quantity,
          0,
        ) + batch.shipmentItems.reduce((sum, row) => sum + row.quantity, 0);
      if (dto.newQuantity < allocated)
        throw new BadRequestException(
          'Kiểm kê không được thấp hơn lượng lô đã giữ cho đơn/chuyến',
        );
      const delta = dto.newQuantity - batch.quantity;
      const afterInventoryQuantity = currentInventory.currentQuantity + delta;
      if (afterInventoryQuantity < currentInventory.reservedQuantity) {
        throw new BadRequestException(
          'Kết quả kiểm kê thấp hơn số lượng đang được giữ cho đơn/chuyến hàng',
        );
      }
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          quantity: dto.newQuantity,
          status:
            dto.newQuantity === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE,
        },
      });
      await tx.inventory.update({
        where: { id: dto.inventoryId },
        data: { currentQuantity: afterInventoryQuantity },
      });

      const movement = await tx.stockMovement.create({
        data: {
          inventory: { connect: { id: dto.inventoryId } },
          batch: { connect: { id: batch.id } },
          movementType: 'ADJUSTMENT',
          quantity: delta,
          beforeQuantity: currentInventory.currentQuantity,
          afterQuantity: afterInventoryQuantity,
          reason: dto.reason,
          note: dto.note,
          createdBy: { connect: { id: currentUser.id } },
        },
      });

      this.logger.log(
        `Stock ADJUSTMENT: Batch ${dto.batchId}, ${batch.quantity} → ${dto.newQuantity}`,
      );
      return {
        movement,
        updatedBatchQuantity: dto.newQuantity,
        updatedInventoryQuantity: afterInventoryQuantity,
      };
    });
  }

  // ── Transfer ───────────────────────────────────────────────────────────────

  async stockTransfer(dto: StockTransferDto, currentUser: RequestUser) {
    if (dto.fromInventoryId === dto.toInventoryId) {
      throw new BadRequestException('Kho nguồn và kho đích phải khác nhau');
    }
    if (!Number.isSafeInteger(dto.quantity) || dto.quantity <= 0) {
      throw new BadRequestException('Số lượng chuyển phải là số nguyên dương');
    }
    const transferKey = dto.idempotencyKey?.trim();
    if (!transferKey) {
      throw new BadRequestException('Thiếu khóa chống gửi trùng');
    }
    const [fromInv, toInv] = await Promise.all([
      this.inventoryRepository.findInventoryById(dto.fromInventoryId),
      this.inventoryRepository.findInventoryById(dto.toInventoryId),
    ]);

    if (!fromInv) throw new NotFoundException('Không tìm thấy kho nguồn');
    if (!toInv) throw new NotFoundException('Không tìm thấy kho đích');
    if (!fromInv.warehouse.isActive || !toInv.warehouse.isActive) {
      throw new BadRequestException(
        'Kho nguồn và kho đích phải đang hoạt động',
      );
    }

    this.assertInventoryAccess(
      fromInv,
      currentUser,
      'Bạn không có quyền chuyển hàng giữa các kho này',
    );
    this.assertInventoryAccess(
      toInv,
      currentUser,
      'Bạn không có quyền chuyển hàng giữa các kho này',
    );
    if (fromInv.productId !== toInv.productId) {
      throw new BadRequestException(
        'Chỉ có thể chuyển hàng cùng một loại sản phẩm',
      );
    }
    if (
      !fromInv.warehouse.sellerId ||
      fromInv.warehouse.sellerId !== toInv.warehouse.sellerId ||
      fromInv.warehouse.sellerId !== fromInv.product.sellerId
    ) {
      throw new BadRequestException(
        'Chỉ được chuyển kho trong cùng phạm vi sở hữu của một SELLER',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "inventories"
        WHERE "id" IN (${dto.fromInventoryId}::uuid, ${dto.toInventoryId}::uuid)
        ORDER BY "id" FOR UPDATE
      `;
      const previousMovements = await tx.stockMovement.findMany({
        where: {
          referenceId: transferKey,
          referenceType: 'INVENTORY_TRANSFER',
          inventoryId: dto.fromInventoryId,
        },
      });
      if (previousMovements.length > 0) {
        const sameRequest =
          previousMovements.every(
            (movement) =>
              movement.toInventoryId === dto.toInventoryId &&
              movement.createdById === currentUser.id &&
              (movement.reason ?? '') === (dto.reason?.trim() ?? '') &&
              (movement.note ?? '') === (dto.note?.trim() ?? ''),
          ) &&
          previousMovements.reduce(
            (sum, movement) => sum - movement.quantity,
            0,
          ) === dto.quantity;
        if (!sameRequest) {
          throw new ConflictException(
            'Khóa chống gửi trùng đã được dùng cho nội dung chuyển kho khác',
          );
        }
        const [currentFrom, currentTo] = await Promise.all([
          tx.inventory.findUniqueOrThrow({
            where: { id: dto.fromInventoryId },
          }),
          tx.inventory.findUniqueOrThrow({ where: { id: dto.toInventoryId } }),
        ]);
        return {
          fromQuantity: currentFrom.currentQuantity,
          toQuantity: currentTo.currentQuantity,
          idempotentReplay: true,
        };
      }
      const [lockedFrom, lockedTo] = await Promise.all([
        tx.inventory.findUniqueOrThrow({ where: { id: dto.fromInventoryId } }),
        tx.inventory.findUniqueOrThrow({ where: { id: dto.toInventoryId } }),
      ]);
      if (
        lockedFrom.currentQuantity - lockedFrom.reservedQuantity <
        dto.quantity
      ) {
        throw new BadRequestException(
          'Tồn khả dụng đã thay đổi; kho nguồn không còn đủ hàng để chuyển',
        );
      }
      const sourceBatches = await tx.inventoryBatch.findMany({
        where: {
          inventoryId: dto.fromInventoryId,
          status: BatchStatus.ACTIVE,
          lifecycleStatus: BatchLifecycleStatus.RELEASED,
          qualityStatus: QualityStatus.PASSED,
          quantity: { gt: 0 },
          OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
        },
        include: {
          orderItemReservations: {
            where: { status: 'ACTIVE' },
            select: { quantity: true },
          },
          shipmentItems: {
            where: {
              orderItemId: null,
              shipment: { status: { in: ['DRAFT', 'ASSIGNED'] } },
            },
            select: { quantity: true },
          },
        },
        orderBy: [{ expiryDate: 'asc' }, { receivedDate: 'asc' }],
      });
      let remaining = dto.quantity;
      const allocations: Array<{
        sourceBatchId: string;
        destinationBatchId: string;
        quantity: number;
        sourceBefore: number;
        sourceAfter: number;
      }> = [];

      for (const source of sourceBatches) {
        if (remaining === 0) break;
        const allocated =
          source.orderItemReservations.reduce(
            (sum, reservation) => sum + reservation.quantity,
            0,
          ) +
          source.shipmentItems.reduce((sum, item) => sum + item.quantity, 0);
        const available = Math.max(source.quantity - allocated, 0);
        if (available === 0) continue;
        const moved = Math.min(available, remaining);
        const sourceAfter = source.quantity - moved;
        await tx.inventoryBatch.update({
          where: { id: source.id },
          data: {
            quantity: sourceAfter,
            status:
              sourceAfter === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE,
          },
        });
        const destinationBatch = await tx.inventoryBatch.create({
          data: {
            inventoryId: dto.toInventoryId,
            batchNumber: `${source.batchNumber}-T-${randomUUID().slice(0, 6).toUpperCase()}`,
            quantity: moved,
            initialQuantity: moved,
            declaredQuantity: moved,
            lifecycleStatus: BatchLifecycleStatus.QUARANTINED,
            status: BatchStatus.ACTIVE,
            qualityStatus: QualityStatus.QUARANTINE,
            declaredById: currentUser.id,
            declarationIdempotencyKey: `${transferKey.slice(0, 55)}-${source.id}`,
            parentBatchId: source.id,
            supplier: source.supplier,
            harvestDate: source.harvestDate,
            manufactureDate: source.manufactureDate,
            expiryDate: source.expiryDate,
            receivedDate: new Date(),
            actualReceivedAt: new Date(),
            warehouseLocation: null,
          },
        });
        allocations.push({
          sourceBatchId: source.id,
          destinationBatchId: destinationBatch.id,
          quantity: moved,
          sourceBefore: source.quantity,
          sourceAfter,
        });
        remaining -= moved;
      }
      if (remaining > 0) {
        throw new BadRequestException(
          'Không đủ số lượng từ các lô đã RELEASED và chưa được giữ chỗ',
        );
      }
      const beforeFrom = lockedFrom.currentQuantity;
      const afterFrom = beforeFrom - dto.quantity;
      const beforeTo = lockedTo.currentQuantity;
      const afterTo = beforeTo + dto.quantity;

      await tx.inventory.update({
        where: { id: dto.fromInventoryId },
        data: { currentQuantity: afterFrom },
      });
      await tx.inventory.update({
        where: { id: dto.toInventoryId },
        data: { currentQuantity: afterTo },
      });

      for (const allocation of allocations) {
        await tx.stockMovement.create({
          data: {
            inventoryId: dto.fromInventoryId,
            batchId: allocation.sourceBatchId,
            movementType: 'TRANSFER',
            quantity: -allocation.quantity,
            beforeQuantity: allocation.sourceBefore,
            afterQuantity: allocation.sourceAfter,
            toInventoryId: dto.toInventoryId,
            referenceId: transferKey,
            referenceType: 'INVENTORY_TRANSFER',
            reason: dto.reason?.trim(),
            note: dto.note?.trim(),
            createdById: currentUser.id,
          },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: dto.toInventoryId,
            batchId: allocation.destinationBatchId,
            movementType: 'TRANSFER',
            quantity: allocation.quantity,
            beforeQuantity: 0,
            afterQuantity: allocation.quantity,
            referenceId: transferKey,
            referenceType: 'INVENTORY_TRANSFER',
            reason: dto.reason?.trim(),
            note: dto.note?.trim(),
            createdById: currentUser.id,
          },
        });
      }

      this.logger.log(
        `Stock TRANSFER: ${dto.fromInventoryId} → ${dto.toInventoryId}, qty=${dto.quantity}`,
      );
      return { fromQuantity: afterFrom, toQuantity: afterTo, allocations };
    });
  }

  async updateMinimumQuantity(
    id: string,
    minimumQuantity: number,
    currentUser: RequestUser,
  ) {
    if (!Number.isSafeInteger(minimumQuantity) || minimumQuantity < 0) {
      throw new BadRequestException(
        'Ngưỡng tồn kho phải là số nguyên không âm',
      );
    }
    const inventory = await this.inventoryRepository.findInventoryById(id);
    if (!inventory)
      throw new NotFoundException('Không tìm thấy bản ghi tồn kho');
    this.assertInventoryAccess(
      inventory,
      currentUser,
      'Bạn không có quyền chỉnh sửa kho này',
    );
    return this.inventoryRepository.updateMinimumQuantity(id, minimumQuantity);
  }
}
