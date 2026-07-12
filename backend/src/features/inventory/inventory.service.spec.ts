import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';

const mockPrisma = {
  $transaction: jest.fn((cb) => cb(mockPrisma)),
  inventory: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
  inventoryBatch: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
  },
};

const adminUser = { id: 'admin-1', role: RoleName.ADMIN, email: 'admin@test.com' };
const sellerUser = { id: 'seller-1', role: RoleName.SELLER, email: 'seller@test.com' };

const mockInventory = (overrides: any = {}) => ({
  id: 'inv-1',
  warehouseId: 'wh-1',
  productId: 'prod-1',
  currentQuantity: 100,
  reservedQuantity: 0,
  minimumQuantity: 10,
  warehouse: { id: 'wh-1', managerId: 'seller-1', name: 'Kho Test' },
  product: { id: 'prod-1', name: 'Mật Ong', images: [] },
  batches: [],
  ...overrides,
});

describe('InventoryService', () => {
  let service: InventoryService;
  let repo: jest.Mocked<InventoryRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<InventoryRepository>> = {
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

  describe('stockIn()', () => {
    it('should create a batch and increase currentQuantity', async () => {
      const inv = mockInventory({ currentQuantity: 50 });
      repo.findInventoryById.mockResolvedValue(inv as any);
      mockPrisma.inventoryBatch.count.mockResolvedValue(0);
      mockPrisma.inventoryBatch.create.mockResolvedValue({ id: 'batch-1', batchNumber: '20260709-MATONG-001', quantity: 30 });
      mockPrisma.inventory.update.mockResolvedValue({ ...inv, currentQuantity: 80 });
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'mv-1' });

      const result = await service.stockIn({ inventoryId: 'inv-1', quantity: 30 }, sellerUser as any);

      expect(mockPrisma.inventoryBatch.create).toHaveBeenCalled();
      expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currentQuantity: 80 }) })
      );
      expect(result.batch).toBeDefined();
    });

    it('should throw ForbiddenException if seller tries to stock into another seller warehouse', async () => {
      const inv = mockInventory({ warehouse: { managerId: 'other-seller', name: 'Kho khác' } });
      repo.findInventoryById.mockResolvedValue(inv as any);

      await expect(service.stockIn({ inventoryId: 'inv-1', quantity: 10 }, sellerUser as any))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('stockOut() — FIFO', () => {
    it('should deduct from oldest batch first (FIFO)', async () => {
      const inv = mockInventory({ currentQuantity: 150, reservedQuantity: 0 });
      repo.findInventoryById.mockResolvedValue(inv as any);

      const batches = [
        { id: 'b1', quantity: 100, receivedDate: new Date('2026-01-01'), status: 'ACTIVE' },
        { id: 'b2', quantity: 50, receivedDate: new Date('2026-02-01'), status: 'ACTIVE' },
      ];
      mockPrisma.inventoryBatch.findMany.mockResolvedValue(batches);
      mockPrisma.inventoryBatch.update.mockResolvedValue({});
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'mv-1' });
      mockPrisma.inventory.update.mockResolvedValue({});

      await service.stockOut({ inventoryId: 'inv-1', quantity: 80 }, sellerUser as any);

      // First batch should be deducted 80 units (fully consumed: 100 → 20 remaining)
      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b1' }, data: expect.objectContaining({ quantity: 20 }) })
      );
    });

    it('should throw BadRequestException if available stock is insufficient', async () => {
      const inv = mockInventory({ currentQuantity: 10, reservedQuantity: 5 }); // available = 5
      repo.findInventoryById.mockResolvedValue(inv as any);

      await expect(service.stockOut({ inventoryId: 'inv-1', quantity: 20 }, sellerUser as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should mark batch as DEPLETED when quantity reaches 0', async () => {
      const inv = mockInventory({ currentQuantity: 50, reservedQuantity: 0 });
      repo.findInventoryById.mockResolvedValue(inv as any);

      const batches = [{ id: 'b1', quantity: 50, receivedDate: new Date('2026-01-01'), status: 'ACTIVE' }];
      mockPrisma.inventoryBatch.findMany.mockResolvedValue(batches);
      mockPrisma.inventoryBatch.update.mockResolvedValue({});
      mockPrisma.stockMovement.create.mockResolvedValue({});
      mockPrisma.inventory.update.mockResolvedValue({});

      await service.stockOut({ inventoryId: 'inv-1', quantity: 50 }, sellerUser as any);

      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DEPLETED', quantity: 0 }) })
      );
    });
  });

  describe('stockAdjust()', () => {
    it('should throw ForbiddenException for non-admin users', async () => {
      await expect(service.stockAdjust({ inventoryId: 'inv-1', newQuantity: 50, reason: 'Kiểm kê' }, sellerUser as any))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if newQuantity is negative', async () => {
      const inv = mockInventory();
      repo.findInventoryById.mockResolvedValue(inv as any);

      await expect(service.stockAdjust({ inventoryId: 'inv-1', newQuantity: -5, reason: 'Test' }, adminUser as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should update inventory and create ADJUSTMENT movement', async () => {
      const inv = mockInventory({ currentQuantity: 100 });
      repo.findInventoryById.mockResolvedValue(inv as any);
      mockPrisma.inventory.update.mockResolvedValue({ ...inv, currentQuantity: 95 });
      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'mv-1', movementType: 'ADJUSTMENT', quantity: -5 });

      const result = await service.stockAdjust({ inventoryId: 'inv-1', newQuantity: 95, reason: 'Kiểm kê tháng 7' }, adminUser as any);

      expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currentQuantity: 95 }) })
      );
      expect(result.updatedQuantity).toBe(95);
    });
  });

  describe('stockTransfer()', () => {
    it('should throw BadRequestException if products mismatch', async () => {
      const from = mockInventory({ productId: 'prod-1' });
      const to = mockInventory({ id: 'inv-2', productId: 'prod-999' }); // different product
      repo.findInventoryById
        .mockResolvedValueOnce(from as any)
        .mockResolvedValueOnce(to as any);

      await expect(service.stockTransfer({
        fromInventoryId: 'inv-1', toInventoryId: 'inv-2', quantity: 10, reason: 'test',
      }, adminUser as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if source has insufficient stock', async () => {
      const from = mockInventory({ currentQuantity: 5 });
      const to = mockInventory({ id: 'inv-2', productId: 'prod-1' });
      repo.findInventoryById
        .mockResolvedValueOnce(from as any)
        .mockResolvedValueOnce(to as any);

      await expect(service.stockTransfer({
        fromInventoryId: 'inv-1', toInventoryId: 'inv-2', quantity: 20, reason: 'test',
      }, adminUser as any)).rejects.toThrow(BadRequestException);
    });
  });
});
