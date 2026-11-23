import { objectContaining } from '../../../test/helpers/matchers';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BatchLifecycleStatus as State,
  RoleName,
  QualityStatus,
} from '@prisma/client';
import { SupplyChainService } from './supply-chain.service';
import { lotRequestFingerprint } from './lot-request';
import { requestUser } from '../../../test/helpers/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainQueueService } from '../blockchain-queue/blockchain-queue.service';

type LotEvent = {
  action: string;
  idempotencyKey?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

function createBatch() {
  return {
    id: 'batch',
    inventoryId: 'inventory',
    batchNumber: 'LOT-1',
    declaredQuantity: 10,
    quantity: 0,
    status: 'ACTIVE',
    lifecycleStatus: State.SUBMITTED as State,
    qualityStatus: QualityStatus.QUARANTINE as QualityStatus,
    expiryDate: null as Date | null,
    lifecycleEvents: [] as LotEvent[],
    journeys: [] as { stage: { name: string } }[],
    originDeclarations: [
      { party: { isVerified: true }, location: { isVerified: true } },
    ],
    inventory: {
      currentQuantity: 30,
      productId: 'product',
      product: { name: 'Product', sellerId: 'seller' },
      warehouse: { sellerId: 'seller', managerId: 'manager' },
    },
  };
}

function createPrisma(getBatch: () => ReturnType<typeof createBatch>) {
  return {
    $queryRaw: jest
      .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
      .mockResolvedValue([]),
    $transaction: jest.fn(),
    inventoryBatch: {
      findUnique: jest.fn(() => Promise.resolve(getBatch())),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...getBatch(), ...data }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    inventory: {
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ productId: 'product' }),
    },
    stockMovement: { create: jest.fn() },
    batchLifecycleEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    supplyChainStage: {
      findUnique: jest.fn().mockResolvedValue({ id: 'stage' }),
    },
    batchJourney: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'journey', blockchainPayload: {} }),
    },
  };
}

describe('Production lot lifecycle', () => {
  const seller = {
    ...requestUser(),
    id: 'seller',
    email: 'seller@example.test',
    role: RoleName.SELLER,
  };
  const manager = {
    ...requestUser(),
    id: 'manager',
    email: 'manager@example.test',
    role: RoleName.WAREHOUSE_MANAGER,
  };
  const qa = {
    ...requestUser(),
    id: 'qa',
    email: 'qa@example.test',
    role: RoleName.QUALITY_ASSURANCE,
  };
  const admin = {
    ...requestUser(),
    id: 'admin',
    email: 'admin@example.test',
    role: RoleName.ADMIN,
  };
  const dto = {
    idempotencyKey: 'request-0001',
    location: 'Kho A',
    referenceCode: 'REF-1',
    note: 'Đã đối chiếu',
    imageUrls: ['https://example.test/proof.jpg'],
  };
  let batch: ReturnType<typeof createBatch>;
  let prisma: ReturnType<typeof createPrisma>;
  let queue: {
    addSupplyChainRecordJob: jest.Mock;
    createOutboxRecord: jest.Mock;
    enqueueOutboxRecord: jest.Mock;
  };
  let service: SupplyChainService;

  beforeEach(() => {
    batch = createBatch();
    prisma = createPrisma(() => batch);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    queue = {
      addSupplyChainRecordJob: jest.fn().mockResolvedValue(undefined),
      createOutboxRecord: jest.fn().mockResolvedValue({ id: 'outbox-lot-test' }),
      enqueueOutboxRecord: jest.fn().mockResolvedValue(true),
    };
    service = new SupplyChainService(
      prisma as unknown as PrismaService,
      queue as unknown as BlockchainQueueService,
    );
  });

  it('receives actual quantity, quarantines, and records inventory + evidence atomically', async () => {
    const result = await service.receiveProductionBatch(
      batch.id,
      { ...dto, receivedQuantity: 8 },
      manager,
    );
    expect(result.batch.lifecycleStatus).toBe(State.QUARANTINED);
    expect(prisma.inventory.update).toHaveBeenCalledWith({
      where: { id: 'inventory' },
      data: { currentQuantity: { increment: 8 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          beforeQuantity: 30,
          afterQuantity: 38,
        }),
      }),
    );
    expect(prisma.batchLifecycleEvent.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          actorId: manager.id,
          action: 'RECEIVED',
          imageUrls: dto.imageUrls,
        }),
      }),
    );
    const locks = prisma.$queryRaw.mock.calls.map((call) => call[0].join(''));
    expect(locks[0]).toContain('inventories');
    expect(locks[1]).toContain('inventory_batches');
  });

  it.each([seller, qa, admin, { ...manager, id: 'other-manager' }])(
    'rejects unauthorized receipt by $role/$id',
    async (user) => {
      await expect(
        service.receiveProductionBatch(
          batch.id,
          { ...dto, receivedQuantity: 8 },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.inventory.update).not.toHaveBeenCalled();
    },
  );

  it('rejects receipt over declaration or without evidence', async () => {
    await expect(
      service.receiveProductionBatch(
        batch.id,
        { ...dto, receivedQuantity: 11 },
        manager,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.receiveProductionBatch(
        batch.id,
        { ...dto, imageUrls: [], receivedQuantity: 8 },
        manager,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.inventory.update).not.toHaveBeenCalled();
  });

  it('replays a matching receipt without incrementing stock twice', async () => {
    const request = { ...dto, receivedQuantity: 8 };
    batch.lifecycleStatus = State.QUARANTINED;
    batch.lifecycleEvents = [
      {
        idempotencyKey: dto.idempotencyKey,
        action: 'RECEIVED',
        actorId: manager.id,
        metadata: { requestFingerprint: lotRequestFingerprint(request) },
      },
    ];
    await service.receiveProductionBatch(batch.id, request, manager);
    expect(prisma.inventory.update).not.toHaveBeenCalled();
    await expect(
      service.receiveProductionBatch(
        batch.id,
        { ...request, receivedQuantity: 7 },
        manager,
      ),
    ).rejects.toThrow('Idempotency key');
  });

  it.each([seller, manager, admin])(
    'rejects QA operations by $role even if service is called directly',
    async (user) => {
      await expect(
        service.inspectProductionBatch(
          batch.id,
          { ...dto, qualityStatus: QualityStatus.PASSED },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.releaseProductionBatch(batch.id, dto, user),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    [QualityStatus.PASSED, State.QC_PASSED],
    [QualityStatus.FAILED, State.REJECTED],
  ])('records QA %s as %s, not RELEASED', async (qualityStatus, state) => {
    batch.lifecycleStatus = State.QUARANTINED;
    const result = await service.inspectProductionBatch(
      batch.id,
      { ...dto, qualityStatus },
      qa,
    );
    expect(result.batch.lifecycleStatus).toBe(state);
    expect(prisma.inventory.update).not.toHaveBeenCalled();
  });

  it('does not allow reusing receipt idempotency key for a QA action', async () => {
    batch.lifecycleEvents = [
      {
        idempotencyKey: dto.idempotencyKey,
        action: 'RECEIVED',
        actorId: manager.id,
        metadata: {},
      },
    ];
    await expect(
      service.inspectProductionBatch(
        batch.id,
        { ...dto, qualityStatus: QualityStatus.PASSED },
        qa,
      ),
    ).rejects.toThrow('Idempotency key');
  });

  it('requires put-away and verified origin before release', async () => {
    batch.lifecycleStatus = State.QC_PASSED;
    batch.qualityStatus = QualityStatus.PASSED;
    batch.quantity = 8;
    await expect(
      service.releaseProductionBatch(batch.id, dto, qa),
    ).rejects.toThrow('vị trí lưu trữ');
    batch.journeys = [{ stage: { name: 'WAREHOUSE' } }];
    batch.lifecycleEvents = [{ action: 'PUT_AWAY' }];
    batch.originDeclarations[0].party.isVerified = false;
    await expect(
      service.releaseProductionBatch(batch.id, dto, qa),
    ).rejects.toThrow('Nguồn gốc');
    batch.originDeclarations[0].party.isVerified = true;
    const result = await service.releaseProductionBatch(batch.id, dto, qa);
    expect(result.lifecycleStatus).toBe(State.RELEASED);
  });

  it('rejects expired stock even after passing QA', async () => {
    batch.lifecycleEvents = [{ action: 'PUT_AWAY' }];
    Object.assign(batch, {
      lifecycleStatus: State.QC_PASSED,
      qualityStatus: QualityStatus.PASSED,
      quantity: 8,
      expiryDate: new Date(0),
      journeys: [{ stage: { name: 'WAREHOUSE' } }],
    });
    await expect(
      service.releaseProductionBatch(batch.id, dto, qa),
    ).rejects.toThrow('hết hạn');
  });

  it('rejects submission missing origin/production stages', async () => {
    batch.lifecycleStatus = State.DRAFT;
    await expect(
      service.submitProductionBatch(batch.id, dto, seller),
    ).rejects.toThrow('công đoạn bắt buộc');
    batch.journeys = ['HARVEST', 'PROCESSING', 'PACKAGING'].map((name) => ({
      stage: { name },
    }));
    expect(
      (await service.submitProductionBatch(batch.id, dto, seller))
        .lifecycleStatus,
    ).toBe(State.SUBMITTED);
    expect(prisma.inventory.update).not.toHaveBeenCalled();
  });

  it('rejects chronology before the latest journey', async () => {
    batch.lifecycleStatus = State.DRAFT;
    batch.journeys = ['HARVEST', 'PROCESSING', 'PACKAGING'].map((name) => ({
      stage: { name },
    }));
    prisma.batchJourney.findFirst.mockResolvedValue({ eventTime: new Date() });
    await expect(
      service.submitProductionBatch(
        batch.id,
        { ...dto, eventTime: '2020-01-01T00:00:00Z' },
        seller,
      ),
    ).rejects.toThrow('công đoạn gần nhất');
  });

  it('rejects non-seller declarations before touching the database', async () => {
    await expect(
      service.createProductionBatch(
        {
          inventoryId: 'inventory',
          declaredQuantity: 1,
          idempotencyKey: 'declaration-1',
        },
        manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.inventoryBatch.findFirst).not.toHaveBeenCalled();
  });

  it('fingerprints are insensitive to field order but detect evidence/quantity changes', () => {
    expect(lotRequestFingerprint({ quantity: 1, note: ' x ' })).toBe(
      lotRequestFingerprint({ note: 'x', quantity: 1 }),
    );
    expect(lotRequestFingerprint({ quantity: 1 })).not.toBe(
      lotRequestFingerprint({ quantity: 2 }),
    );
  });
});
