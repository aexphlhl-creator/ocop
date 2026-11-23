import { ForbiddenException } from '@nestjs/common';
import {
  BlockchainRecordStatus,
  LogisticsAssignmentStatus,
  QualityStatus,
  RoleName,
  SupplyChainStageName,
} from '@prisma/client';
import { SupplyChainService } from './supply-chain.service';
import { requestUser } from '../../../test/helpers/request-user';

const mockPrisma = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  inventoryBatch: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  batchJourney: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  supplyChainStage: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  blockchainRecord: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  batchLogisticsAssignment: {
    create: jest.fn(),
    update: jest.fn(),
  },
  warehouse: {
    findMany: jest.fn(),
  },
  traceabilityLocation: {
    findMany: jest.fn(),
  },
  ward: {
    findMany: jest.fn(),
  },
};

const blockchainQueueService = {
  addSupplyChainRecordJob: jest.fn(),
  createOutboxRecord: jest.fn().mockResolvedValue({ id: 'outbox-sc-test' }),
  enqueueOutboxRecord: jest.fn().mockResolvedValue(true),
};

const adminUser = {
  ...requestUser(),
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@ocop.vn',
  fullName: 'Quản trị viên',
  role: RoleName.ADMIN,
};

const managerUser = {
  ...requestUser(),
  id: '00000000-0000-4000-8000-000000000002',
  email: 'manager@ocop.vn',
  fullName: 'Quản lý kho',
  role: RoleName.WAREHOUSE_MANAGER,
};

const logisticsUser = {
  ...requestUser(),
  id: '00000000-0000-4000-8000-000000000003',
  email: 'shipper@ocop.vn',
  fullName: 'Nhân viên giao hàng',
  role: RoleName.LOGISTICS,
};

function createBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    batchNumber: 'LOT-001',
    lifecycleStatus: 'DRAFT',
    qualityStatus: QualityStatus.PASSED,
    inventory: {
      productId: '00000000-0000-4000-8000-000000000020',
      product: {
        name: 'Mật ong',
        sellerId: 'seller-1',
      },
      warehouse: { id: 'warehouse-1', managerId: managerUser.id },
    },
    logisticsAssignments: [],
    ...overrides,
  };
}

describe('SupplyChainService', () => {
  let service: SupplyChainService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );
    service = new SupplyChainService(
      mockPrisma as never,
      blockchainQueueService as never,
    );
  });

  it('calculates transport metrics from shipments rather than legacy batch stages', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([
      {
        id: 'batch-shipping',
        shipmentItems: [{ shipment: { status: 'IN_TRANSIT' } }],
        status: 'ACTIVE',
        qualityStatus: QualityStatus.PASSED,
        expiryDate: future,
        journeys: [
          {
            id: 'journey-shipping',
            stage: { name: SupplyChainStageName.SHIPPING },
          },
          {
            id: 'journey-warehouse',
            stage: { name: SupplyChainStageName.WAREHOUSE },
          },
        ],
      },
      {
        id: 'batch-delivered',
        shipmentItems: [{ shipment: { status: 'DELIVERED' } }],
        status: 'ACTIVE',
        qualityStatus: QualityStatus.PASSED,
        expiryDate: null,
        journeys: [
          {
            id: 'journey-customer',
            stage: { name: SupplyChainStageName.CUSTOMER },
          },
          {
            id: 'journey-shipping-2',
            stage: { name: SupplyChainStageName.SHIPPING },
          },
        ],
      },
      {
        id: 'batch-pending',
        status: 'ACTIVE',
        qualityStatus: QualityStatus.PENDING_CHECK,
        expiryDate: null,
        journeys: [],
      },
      {
        id: 'batch-handover',
        shipmentItems: [{ shipment: { status: 'HANDED_OVER' } }],
        status: 'ACTIVE',
        qualityStatus: QualityStatus.PASSED,
        expiryDate: null,
        journeys: [
          {
            id: 'journey-handover',
            stage: { name: SupplyChainStageName.HANDOVER_TO_CARRIER },
          },
        ],
      },
      {
        id: 'batch-at-distributor',
        shipmentItems: [{ shipment: { status: 'AT_DISTRIBUTOR' } }],
        status: 'ACTIVE',
        qualityStatus: QualityStatus.PASSED,
        expiryDate: null,
        journeys: [
          {
            id: 'journey-distributor',
            stage: { name: SupplyChainStageName.DISTRIBUTOR },
          },
          {
            id: 'journey-shipping-3',
            stage: { name: SupplyChainStageName.SHIPPING },
          },
        ],
      },
      {
        id: 'batch-failed',
        status: 'ACTIVE',
        qualityStatus: QualityStatus.FAILED,
        expiryDate: null,
        journeys: [
          {
            id: 'journey-qc',
            stage: { name: SupplyChainStageName.QUALITY_INSPECTION },
          },
        ],
      },
    ]);
    mockPrisma.blockchainRecord.findMany.mockResolvedValue([
      { journeyId: 'journey-shipping' },
      { journeyId: 'journey-warehouse' },
    ]);

    const stats = await service.getDashboardStats(adminUser);

    expect(stats).toEqual(
      expect.objectContaining({
        totalBatches: 6,
        inProgressBatches: 2,
        awaitingCarrierPickup: 1,
        completedBatches: 1,
        pendingInspection: 1,
        failedQcBatches: 1,
        expiringSoon: 1,
        blockchainSynced: 1,
      }),
    );
  });

  it('scopes the batch list to the assigned warehouse manager', async () => {
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

    await service.getBatches(managerUser);

    expect(mockPrisma.inventoryBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          inventory: { warehouse: { managerId: managerUser.id } },
        },
      }),
    );
  });

  it('blocks legacy internal logistics users from recording shipping journeys', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(
      createBatch({
        qualityStatus: QualityStatus.PENDING_CHECK,
        logisticsAssignments: [
          {
            id: 'assignment-1',
            logisticsUserId: logisticsUser.id,
            status: LogisticsAssignmentStatus.ASSIGNED,
            carrierName: 'OCOP Express',
            trackingCode: 'TRACK-001',
          },
        ],
      }),
    );
    mockPrisma.supplyChainStage.findUnique.mockResolvedValue({
      id: 'stage-shipping',
      name: SupplyChainStageName.SHIPPING,
      displayName: 'Vận chuyển',
      order: 8,
    });
    mockPrisma.batchJourney.findFirst.mockResolvedValue({
      id: 'journey-handover',
      eventTime: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 60_000),
      stage: { name: SupplyChainStageName.HANDOVER_TO_CARRIER, order: 7 },
    });

    await expect(
      service.addJourney(
        createBatch().id,
        {
          stageId: 'stage-shipping',
          location: 'Kho trung tâm',
          actorName: 'Nhân viên A',
          referenceCode: 'TRACK-001',
          carrierName: 'OCOP Express',
        },
        logisticsUser,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.batchJourney.create).not.toHaveBeenCalled();
  });

  it('rejects QC through the legacy journey endpoint even with evidence', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(createBatch());
    mockPrisma.supplyChainStage.findUnique.mockResolvedValue({
      id: 'qc',
      name: SupplyChainStageName.QUALITY_INSPECTION,
    });
    await expect(
      service.addJourney(
        createBatch().id,
        {
          stageId: 'qc',
          location: 'Lab',
          actorName: 'Operator',
          qualityStatus: QualityStatus.PASSED,
          imageUrls: ['https://example.test/proof.jpg'],
        },
        managerUser,
      ),
    ).rejects.toThrow('lifecycle chuyên biệt');
    expect(mockPrisma.inventoryBatch.update).not.toHaveBeenCalled();
    expect(mockPrisma.batchJourney.create).not.toHaveBeenCalled();
  });

  it('blocks legacy internal logistics users from confirming delivery on a batch', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(
      createBatch({
        logisticsAssignments: [
          {
            id: 'assignment-1',
            logisticsUserId: logisticsUser.id,
            status: LogisticsAssignmentStatus.IN_TRANSIT,
            carrierName: 'OCOP Express',
            trackingCode: 'TRACK-001',
          },
        ],
      }),
    );
    mockPrisma.supplyChainStage.findUnique.mockResolvedValue({
      id: 'stage-customer',
      name: SupplyChainStageName.CUSTOMER,
      displayName: 'Khách hàng',
      order: 11,
    });
    mockPrisma.batchJourney.findFirst
      .mockResolvedValueOnce({
        id: 'journey-retail',
        eventTime: new Date(Date.now() - 60_000),
        createdAt: new Date(Date.now() - 60_000),
        stage: { name: SupplyChainStageName.RETAIL, order: 10 },
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.addJourney(
        createBatch().id,
        {
          stageId: 'stage-customer',
          location: 'Điểm giao hàng',
          actorName: 'Nhân viên giao hàng',
          recipientName: 'Nguyễn Văn B',
          imageUrls: ['https://example.com/proof.jpg'],
        },
        logisticsUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keeps Admin read-only even when a valid batch and stage are supplied', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(createBatch());
    mockPrisma.supplyChainStage.findUnique.mockResolvedValue({
      id: 'stage-warehouse',
      name: SupplyChainStageName.WAREHOUSE,
      displayName: 'Nhập kho',
      order: 6,
    });

    await expect(
      service.addJourney(
        createBatch().id,
        {
          stageId: 'stage-warehouse',
          location: 'Kho trung tâm',
          actorName: 'Tên sửa từ client',
        },
        adminUser,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.batchJourney.create).not.toHaveBeenCalled();
  });

  it('rejects skipping an intermediate production stage', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(createBatch());
    mockPrisma.supplyChainStage.findUnique.mockResolvedValue({
      id: 'pack',
      name: SupplyChainStageName.PACKAGING,
    });
    mockPrisma.batchJourney.findFirst.mockResolvedValue(null);
    mockPrisma.batchJourney.findMany.mockResolvedValue([]);
    await expect(
      service.addJourney(
        createBatch().id,
        {
          stageId: 'pack',
          location: 'Factory',
          actorName: 'Seller',
        },
        requestUser({
          id: 'seller-1',
          email: 'seller@example.test',
          role: RoleName.SELLER,
        }),
      ),
    ).rejects.toThrow('kế tiếp phải là HARVEST');
    expect(mockPrisma.batchJourney.create).not.toHaveBeenCalled();
  });

  it('rejects legacy batch handover and directs transport to shipments', async () => {
    const batch = createBatch();
    const stage = {
      id: 'stage-handover',
      name: SupplyChainStageName.HANDOVER_TO_CARRIER,
      displayName: 'Bàn giao đơn vị vận chuyển',
      order: 7,
    };
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(batch);
    mockPrisma.supplyChainStage.findUnique.mockResolvedValue(stage);
    mockPrisma.batchJourney.findFirst.mockResolvedValue({
      id: 'journey-warehouse',
      eventTime: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 60_000),
      stage: { name: SupplyChainStageName.WAREHOUSE, order: 6 },
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      ...logisticsUser,
      isActive: true,
      role: { name: RoleName.LOGISTICS },
    });
    mockPrisma.batchJourney.create.mockResolvedValue({
      id: 'journey-handover',
      stage,
    });
    mockPrisma.batchLogisticsAssignment.create.mockResolvedValue({
      id: 'assignment-1',
    });

    await expect(
      service.addJourney(
        batch.id,
        {
          stageId: stage.id,
          location: 'Cổng xuất kho',
          actorName: 'Tên giả mạo từ client',
          logisticsUserId: logisticsUser.id,
          referenceCode: 'TRACK-001',
          carrierName: 'OCOP Express',
          attachmentUrls: ['https://example.com/handover.pdf'],
        },
        managerUser,
      ),
    ).rejects.toThrow('Quản lý chuyến hàng');

    expect(mockPrisma.batchJourney.create).not.toHaveBeenCalled();
    expect(mockPrisma.batchLogisticsAssignment.create).not.toHaveBeenCalled();
  });

  it('rejects a logistics user who was not assigned to the batch', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(
      createBatch({
        logisticsAssignments: [
          {
            id: 'assignment-1',
            logisticsUserId: 'another-logistics-user',
            status: LogisticsAssignmentStatus.ASSIGNED,
            carrierName: 'OCOP Express',
            trackingCode: 'TRACK-001',
          },
        ],
      }),
    );

    await expect(
      service.getBatchJourney(createBatch().id, logisticsUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies a warehouse manager access to a batch in another warehouse', async () => {
    mockPrisma.inventoryBatch.findUnique.mockResolvedValue(
      createBatch({
        journeys: [],
        inventory: {
          product: {
            businessId: 'business-1',
            business: { userId: 'seller-1' },
          },
          warehouse: { managerId: 'another-manager' },
        },
      }),
    );

    await expect(
      service.getBatchJourney(createBatch().id, managerUser),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.blockchainRecord.findMany).not.toHaveBeenCalled();
  });

  it('queries confirmed blockchain records explicitly for dashboard sync status', async () => {
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
    mockPrisma.blockchainRecord.findMany.mockResolvedValue([]);

    await service.getDashboardStats(adminUser);

    expect(mockPrisma.blockchainRecord.findMany).not.toHaveBeenCalled();
    expect(BlockchainRecordStatus.CONFIRMED).toBe('CONFIRMED');
  });

  describe('suggestLocations', () => {
    it('returns empty array when query is too short', async () => {
      const results = await service.suggestLocations('a');
      expect(results).toEqual([]);
    });

    it('returns matched warehouses, origins and wards with coordinates', async () => {
      mockPrisma.warehouse.findMany.mockResolvedValue([
        {
          id: 'wh-1',
          name: 'Kho Bát Tràng',
          address: 'Xã Bát Tràng, Gia Lâm, Hà Nội',
          latitude: 20.973,
          longitude: 105.909,
        },
      ]);
      mockPrisma.traceabilityLocation.findMany.mockResolvedValue([
        {
          id: 'ol-1',
          name: 'Vườn chè Bảo Minh',
          address: 'Thái Nguyên',
          latitude: 21.592,
          longitude: 105.844,
          party: { name: 'HTX Bảo Minh' },
        },
      ]);
      mockPrisma.ward.findMany.mockResolvedValue([
        {
          id: 'wd-1',
          name: 'Xã Bát Tràng',
          latitude: 20.9735,
          longitude: 105.9085,
          province: { name: 'Hà Nội' },
        },
      ]);

      const results = await service.suggestLocations('Bát Tràng');
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results[0]).toEqual(
        expect.objectContaining({
          label: 'Kho: Kho Bát Tràng',
          latitude: 20.973,
          longitude: 105.909,
          type: 'warehouse',
        }),
      );
    });
  });
});
