import { objectContaining, anyValue } from '../../../test/helpers/matchers';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { requestUser } from '../../../test/helpers/request-user';

const mockPrisma = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  inventory: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  inventoryBatch: {
    findUnique: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
  },
  warehouse: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
};

const adminUser = {
  ...requestUser(),
  id: 'admin-1',
  role: RoleName.ADMIN,
  email: 'admin@test.com',
};
const sellerUser = {
  ...requestUser(),
  id: 'seller-1',
  role: RoleName.SELLER,
  email: 'seller@test.com',
};
const warehouseManagerUser = {
  ...requestUser(),
  id: 'manager-1',
  role: RoleName.WAREHOUSE_MANAGER,
  email: 'manager@test.com',
};

type InventoryRecord = NonNullable<
  Awaited<ReturnType<InventoryRepository['findInventoryById']>>
>;
type InventoryOverrides = Partial<
  Omit<InventoryRecord, 'warehouse' | 'product'>
> & {
  warehouse?: Partial<InventoryRecord['warehouse']>;
  product?: Partial<InventoryRecord['product']>;
};

const mockInventory = (overrides: InventoryOverrides = {}): InventoryRecord =>
  ({
    id: 'inv-1',
    warehouseId: 'wh-1',
    productId: 'prod-1',
    currentQuantity: 100,
    reservedQuantity: 0,
    minimumQuantity: 10,
    ...overrides,
    warehouse: {
      id: 'wh-1',
      managerId: 'seller-1',
      sellerId: 'seller-1',
      name: 'Kho Test',
      isActive: true,
      ...overrides.warehouse,
    },
    product: {
      id: 'prod-1',
      name: 'Mật Ong',
      images: [],
      sellerId: 'seller-1',
      ...overrides.product,
    },
    batches: [],
  }) as InventoryRecord;

describe('InventoryService', () => {
  let service: InventoryService;
  let repo: jest.Mocked<
    Pick<
      InventoryRepository,
      | 'findInventoryById'
      | 'findWarehouseById'
      | 'findInventoryByWarehouseAndProduct'
      | 'createInventory'
      | 'createWarehouse'
      | 'findWarehouses'
      | 'findInventories'
      | 'findActiveBatchesFIFO'
      | 'findBatchesByInventory'
      | 'findExpiringBatches'
      | 'findMovements'
      | 'getStats'
      | 'updateMinimumQuantity'
      | 'updateInventoryQuantities'
    >
  >;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.stockMovement.findMany.mockResolvedValue([]);
    const repoMock: typeof repo = {
      findInventoryById: jest.fn(),
      findWarehouseById: jest.fn(),
      findInventoryByWarehouseAndProduct: jest.fn(),
      createInventory: jest.fn(),
      createWarehouse: jest.fn(),
      findWarehouses: jest.fn(),
      findInventories: jest.fn(),
      findActiveBatchesFIFO: jest.fn(),
      findBatchesByInventory: jest.fn(),
      findExpiringBatches: jest.fn(),
      findMovements: jest.fn(),
      getStats: jest.fn(),
      updateMinimumQuantity: jest.fn(),
      updateInventoryQuantities: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: InventoryRepository, useValue: repoMock },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    repo = module.get(InventoryRepository);
  });

  describe('warehouse manager scoping', () => {
    it('assigns a valid active warehouse manager when creating a warehouse', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'seller-1',
        sellerProfile: { isVerified: true },
      });
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);
      mockPrisma.warehouse.count.mockResolvedValue(0);
      mockPrisma.user.findUnique.mockResolvedValue({
        isActive: true,
        role: { name: RoleName.WAREHOUSE_MANAGER },
      });
      repo.createWarehouse.mockResolvedValue({ id: 'wh-new' } as Awaited<
        ReturnType<InventoryRepository['createWarehouse']>
      >);

      await service.createWarehouse(
        {
          name: 'Kho mới',
          sellerId: 'seller-1',
          address: 'Đà Nẵng',
          managerId: 'manager-1',
        },
        adminUser,
      );

      expect(repo.createWarehouse).toHaveBeenCalledWith(
        objectContaining({
          manager: { connect: { id: 'manager-1' } },
        }),
      );
    });

    it('rejects assigning a visitor as warehouse manager', async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        isActive: true,
        role: { name: RoleName.VISITOR },
      });

      await expect(
        service.createWarehouse(
          {
            name: 'Kho không hợp lệ',
            address: 'Đà Nẵng',
            managerId: 'visitor-1',
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns only warehouses assigned to the manager', async () => {
      mockPrisma.warehouse.findMany.mockResolvedValue([]);

      await service.getWarehouses(warehouseManagerUser);

      expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith({
        where: { managerId: 'manager-1', isActive: true },
        include: objectContaining({
          manager: anyValue(Object),
          seller: anyValue(Object),
          _count: objectContaining({
            select: objectContaining({ inventories: true }),
          }),
        }),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('allows admin to update a warehouse and unassign its manager', async () => {
      mockPrisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        name: 'Kho cũ',
        businessId: null,
        sellerId: null,
        isActive: true,
        _count: {
          inventories: 0,
          purchaseOrders: 0,
          goodsReceipts: 0,
          outboundShipments: 0,
          inboundShipments: 0,
        },
      });
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);
      mockPrisma.warehouse.update.mockResolvedValue({ id: 'wh-1' });

      await service.updateWarehouse(
        'wh-1',
        { name: '  Kho mới  ', managerId: null },
        adminUser,
      );

      expect(mockPrisma.warehouse.update).toHaveBeenCalledWith(
        objectContaining({
          where: { id: 'wh-1' },
          data: objectContaining({
            name: 'Kho mới',
            manager: { disconnect: true },
          }),
        }),
      );
    });

    it('rejects warehouse updates from a warehouse manager', async () => {
      await expect(
        service.updateWarehouse(
          'wh-1',
          { name: 'Không được phép' },
          warehouseManagerUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.warehouse.update).not.toHaveBeenCalled();
    });

    it('rejects updating a warehouse to a duplicate name', async () => {
      mockPrisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        name: 'Kho cũ',
        businessId: null,
        sellerId: null,
        isActive: true,
        _count: {
          inventories: 0,
          purchaseOrders: 0,
          goodsReceipts: 0,
          outboundShipments: 0,
          inboundShipments: 0,
        },
      });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-2' });

      await expect(
        service.updateWarehouse('wh-1', { name: 'Kho đã tồn tại' }, adminUser),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.warehouse.update).not.toHaveBeenCalled();
    });

    it('scopes inventory listing by warehouse manager id', async () => {
      repo.findInventories.mockResolvedValue({ items: [], total: 0 });

      await service.getInventories(
        { page: 1, limit: 20 },
        warehouseManagerUser,
      );

      expect(repo.findInventories).toHaveBeenCalledWith(
        objectContaining({
          sellerOwnerId: undefined,
          warehouseManagerId: 'manager-1',
        }),
      );
    });

    it('rejects stock operations on a warehouse assigned to another manager', async () => {
      repo.findInventoryById.mockResolvedValue(
        mockInventory({
          warehouse: {
            id: 'wh-1',
            managerId: 'another-manager',
            name: 'Kho khác',
          },
        }),
      );

      await expect(
        service.stockIn(
          { inventoryId: 'inv-1', quantity: 10 },
          warehouseManagerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createInventory()', () => {
    const approvedProduct = (sellerId: string) => ({
      id: 'prod-1',
      sellerId,
      status: 'APPROVED',
      seller: {
        isActive: true,
        sellerProfile: { isVerified: true },
      },
    });

    const activeWarehouse = (sellerId: string) => ({
      sellerId,
      managerId: null,
      isActive: true,
    });

    it('allows a seller to add their own approved product to their warehouse', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(
        approvedProduct('seller-1'),
      );
      mockPrisma.warehouse.findUnique.mockResolvedValue(
        activeWarehouse('seller-1'),
      );
      repo.findInventoryByWarehouseAndProduct.mockResolvedValue(null);
      repo.createInventory.mockResolvedValue(mockInventory({ id: 'inv-new' }));

      await service.createInventory(
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          minimumQuantity: 5,
        },
        sellerUser,
      );

      expect(repo.createInventory).toHaveBeenCalledWith({
        warehouse: { connect: { id: 'wh-1' } },
        product: { connect: { id: 'prod-1' } },
        minimumQuantity: 5,
      });
    });

    it('rejects a seller adding another seller product even when the warehouse matches that product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(
        approvedProduct('seller-2'),
      );
      mockPrisma.warehouse.findUnique.mockResolvedValue(
        activeWarehouse('seller-2'),
      );

      await expect(
        service.createInventory(
          {
            warehouseId: 'wh-2',
            productId: 'prod-1',
            minimumQuantity: 5,
          },
          sellerUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(repo.createInventory).not.toHaveBeenCalled();
    });
  });

  describe('stockIn()', () => {
    it('should create a batch and increase currentQuantity', async () => {
      const inv = mockInventory({ currentQuantity: 50 });
      repo.findInventoryById.mockResolvedValue(inv);
      mockPrisma.inventoryBatch.count.mockResolvedValue(0);
      mockPrisma.inventoryBatch.create.mockResolvedValue({
        id: 'batch-1',
        batchNumber: '20260709-MATONG-001',
        quantity: 30,
      });
      mockPrisma.inventory.update.mockResolvedValue({
        ...inv,
        currentQuantity: 80,
      });
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'mv-1' });

      const result = await service.stockIn(
        { inventoryId: 'inv-1', quantity: 30 },
        sellerUser,
      );

      expect(mockPrisma.inventoryBatch.create).toHaveBeenCalled();
      expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({ currentQuantity: 80 }),
        }),
      );
      expect(result.batch).toBeDefined();
    });

    it('should throw ForbiddenException if seller tries to stock into another seller warehouse', async () => {
      const inv = mockInventory({
        warehouse: { managerId: 'other-seller', name: 'Kho khác' },
        product: {
          id: 'prod-1',
          name: 'Mật Ong',
          images: [],
          sellerId: 'other-seller',
        },
      });
      repo.findInventoryById.mockResolvedValue(inv);

      await expect(
        service.stockIn({ inventoryId: 'inv-1', quantity: 10 }, sellerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('stockOut() — FIFO', () => {
    it('should deduct from oldest batch first (FIFO)', async () => {
      const inv = mockInventory({ currentQuantity: 150, reservedQuantity: 0 });
      repo.findInventoryById.mockResolvedValue(inv);

      const batches = [
        {
          id: 'b1',
          quantity: 100,
          receivedDate: new Date('2026-01-01'),
          status: 'ACTIVE',
        },
        {
          id: 'b2',
          quantity: 50,
          receivedDate: new Date('2026-02-01'),
          status: 'ACTIVE',
        },
      ];
      mockPrisma.inventoryBatch.findMany.mockResolvedValue(batches);
      mockPrisma.inventoryBatch.update.mockResolvedValue({});
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'mv-1' });
      mockPrisma.inventory.update.mockResolvedValue({});

      await service.stockOut(
        { inventoryId: 'inv-1', quantity: 80 },
        sellerUser,
      );

      // First batch should be deducted 80 units (fully consumed: 100 → 20 remaining)
      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(
        objectContaining({
          where: { id: 'b1' },
          data: objectContaining({ quantity: 20 }),
        }),
      );
    });

    it('should throw BadRequestException if available stock is insufficient', async () => {
      const inv = mockInventory({ currentQuantity: 10, reservedQuantity: 5 }); // available = 5
      repo.findInventoryById.mockResolvedValue(inv);

      await expect(
        service.stockOut({ inventoryId: 'inv-1', quantity: 20 }, sellerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should mark batch as DEPLETED when quantity reaches 0', async () => {
      const inv = mockInventory({ currentQuantity: 50, reservedQuantity: 0 });
      repo.findInventoryById.mockResolvedValue(inv);

      const batches = [
        {
          id: 'b1',
          quantity: 50,
          receivedDate: new Date('2026-01-01'),
          status: 'ACTIVE',
        },
      ];
      mockPrisma.inventoryBatch.findMany.mockResolvedValue(batches);
      mockPrisma.inventoryBatch.update.mockResolvedValue({});
      mockPrisma.stockMovement.create.mockResolvedValue({});
      mockPrisma.inventory.update.mockResolvedValue({});

      await service.stockOut(
        { inventoryId: 'inv-1', quantity: 50 },
        sellerUser,
      );

      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({ status: 'DEPLETED', quantity: 0 }),
        }),
      );
    });
  });

  describe('stockAdjust()', () => {
    it('should throw ForbiddenException for non-admin users', async () => {
      await expect(
        service.stockAdjust(
          {
            inventoryId: 'inv-1',
            batchId: 'batch-1',
            newQuantity: 50,
            reason: 'Kiểm kê',
          },
          sellerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if newQuantity is negative', async () => {
      const inv = mockInventory();
      repo.findInventoryById.mockResolvedValue(inv);

      await expect(
        service.stockAdjust(
          {
            inventoryId: 'inv-1',
            batchId: 'batch-1',
            newQuantity: -5,
            reason: 'Test',
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update inventory and create ADJUSTMENT movement', async () => {
      mockPrisma.inventoryBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        inventoryId: 'inv-1',
        quantity: 100,
        lifecycleStatus: 'RELEASED',
        orderItemReservations: [],
        shipmentItems: [],
      });
      mockPrisma.inventory.findUnique.mockResolvedValue(
        mockInventory({ currentQuantity: 100 }),
      );
      const inv = mockInventory({ currentQuantity: 100 });
      repo.findInventoryById.mockResolvedValue(inv);
      mockPrisma.inventory.update.mockResolvedValue({
        ...inv,
        currentQuantity: 95,
      });
      mockPrisma.stockMovement.create.mockResolvedValue({
        id: 'mv-1',
        movementType: 'ADJUSTMENT',
        quantity: -5,
      });

      const result = await service.stockAdjust(
        {
          inventoryId: 'inv-1',
          batchId: 'batch-1',
          newQuantity: 95,
          reason: 'Kiểm kê tháng 7',
        },
        adminUser,
      );

      expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({ currentQuantity: 95 }),
        }),
      );
      expect(result.updatedInventoryQuantity).toBe(95);
    });
  });

  describe('stockTransfer()', () => {
    const transfer = {
      fromInventoryId: 'inv-1',
      toInventoryId: 'inv-2',
      quantity: 10,
      idempotencyKey: 'transfer-test',
      reason: 'Move to branch',
      note: 'Checked at handover',
    };

    function arrangeInventories(
      from = mockInventory(),
      to = mockInventory({
        id: 'inv-2',
        warehouseId: 'wh-2',
        currentQuantity: 0,
        warehouse: { id: 'wh-2' },
      }),
    ) {
      repo.findInventoryById
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
      mockPrisma.inventory.findUniqueOrThrow
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
    }

    function priorMovement(overrides: Record<string, unknown> = {}) {
      return {
        quantity: -10,
        toInventoryId: transfer.toInventoryId,
        createdById: adminUser.id,
        reason: transfer.reason,
        note: transfer.note,
        ...overrides,
      };
    }

    it.each([
      { toInventoryId: 'inv-1' },
      { quantity: 0 },
      { quantity: -1 },
      { quantity: 1.5 },
      { idempotencyKey: ' ' },
    ])(
      'rejects invalid transfer intent before querying stock: %o',
      async (override) => {
        await expect(
          service.stockTransfer({ ...transfer, ...override }, adminUser),
        ).rejects.toThrow(BadRequestException);
        expect(repo.findInventoryById).not.toHaveBeenCalled();
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('rejects transfers into an inactive warehouse', async () => {
      arrangeInventories(
        mockInventory(),
        mockInventory({ id: 'inv-2', warehouse: { isActive: false } }),
      );
      await expect(service.stockTransfer(transfer, adminUser)).rejects.toThrow(
        'đang hoạt động',
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects transfers across seller ownership even for an admin', async () => {
      arrangeInventories(
        mockInventory(),
        mockInventory({ id: 'inv-2', warehouse: { sellerId: 'seller-2' } }),
      );
      await expect(service.stockTransfer(transfer, adminUser)).rejects.toThrow(
        'cùng phạm vi sở hữu',
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a manager who cannot access the destination warehouse', async () => {
      arrangeInventories(
        mockInventory({ warehouse: { managerId: warehouseManagerUser.id } }),
        mockInventory({
          id: 'inv-2',
          warehouse: { managerId: 'other-manager' },
        }),
      );
      await expect(
        service.stockTransfer(transfer, warehouseManagerUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('replays the same completed transfer even when source stock is now depleted', async () => {
      arrangeInventories(
        mockInventory({ currentQuantity: 0 }),
        mockInventory({ id: 'inv-2', currentQuantity: 10 }),
      );
      mockPrisma.stockMovement.findMany.mockResolvedValue([
        priorMovement({ quantity: -4 }),
        priorMovement({ quantity: -6 }),
      ]);
      await expect(
        service.stockTransfer(
          { ...transfer, reason: ` ${transfer.reason} ` },
          adminUser,
        ),
      ).resolves.toEqual({
        fromQuantity: 0,
        toQuantity: 10,
        idempotentReplay: true,
      });
      expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryBatch.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it.each([
      { quantity: -9 },
      { toInventoryId: 'inv-3' },
      { createdById: 'other-user' },
      { reason: 'Different intent' },
      { note: 'Changed handover details' },
    ])(
      'rejects an idempotency key reused for a different transfer: %o',
      async (override) => {
        arrangeInventories();
        mockPrisma.stockMovement.findMany.mockResolvedValue([
          priorMovement(override),
        ]);
        await expect(
          service.stockTransfer(transfer, adminUser),
        ).rejects.toThrow(ConflictException);
        expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
        expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
      },
    );

    it('only allocates released, passed and non-expired unreserved lots and quarantines the destination', async () => {
      arrangeInventories();
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'source-batch',
          batchNumber: 'LOT-1',
          quantity: 15,
          supplier: null,
          harvestDate: null,
          manufactureDate: null,
          expiryDate: null,
          orderItemReservations: [{ quantity: 3 }],
          shipmentItems: [{ quantity: 2 }],
        },
      ]);
      mockPrisma.inventoryBatch.create.mockResolvedValue({
        id: 'destination-batch',
      });
      const result = await service.stockTransfer(transfer, adminUser);
      expect(mockPrisma.inventoryBatch.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({
            status: 'ACTIVE',
            lifecycleStatus: 'RELEASED',
            qualityStatus: 'PASSED',
            OR: [{ expiryDate: null }, { expiryDate: { gt: anyValue(Date) } }],
          }),
        }),
      );
      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith({
        where: { id: 'source-batch' },
        data: { quantity: 5, status: 'ACTIVE' },
      });
      expect(mockPrisma.inventoryBatch.create).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            inventoryId: 'inv-2',
            parentBatchId: 'source-batch',
            quantity: 10,
            initialQuantity: 10,
            lifecycleStatus: 'QUARANTINED',
            qualityStatus: 'QUARANTINE',
            warehouseLocation: null,
          }),
        }),
      );
      expect(mockPrisma.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(result.fromQuantity).toBe(90);
      expect(result.toQuantity).toBe(10);
    });

    it('does not use quarantined or expired quantities when no eligible released lots remain', async () => {
      arrangeInventories();
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
      await expect(service.stockTransfer(transfer, adminUser)).rejects.toThrow(
        'RELEASED',
      );
      expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryBatch.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if products mismatch', async () => {
      const from = mockInventory({ productId: 'prod-1' });
      const to = mockInventory({ id: 'inv-2', productId: 'prod-999' }); // different product
      repo.findInventoryById
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);

      await expect(
        service.stockTransfer(
          {
            fromInventoryId: 'inv-1',
            toInventoryId: 'inv-2',
            quantity: 10,
            idempotencyKey: 'transfer-test',
            reason: 'test',
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if source has insufficient stock', async () => {
      const from = mockInventory({ currentQuantity: 5 });
      const to = mockInventory({ id: 'inv-2', productId: 'prod-1' });
      repo.findInventoryById
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
      mockPrisma.inventory.findUniqueOrThrow
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);

      await expect(
        service.stockTransfer(
          {
            fromInventoryId: 'inv-1',
            toInventoryId: 'inv-2',
            quantity: 20,
            idempotencyKey: 'transfer-test',
            reason: 'test',
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
