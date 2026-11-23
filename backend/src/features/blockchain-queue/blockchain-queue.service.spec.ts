import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { BlockchainQueueService } from './blockchain-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainClientService } from '../blockchain/blockchain-client.service';
import { BlockchainJobType } from './blockchain.queue';

describe('BlockchainQueueService - Outbox, Concurrency & Breakpoint Recovery', () => {
  let service: BlockchainQueueService;
  let mockPrisma: any;
  let mockBlockchainClient: any;
  let mockQueueAdd: jest.Mock;

  const sampleCertData = {
    certificateId: 'cert-123',
    productId: 'prod-456',
    batchId: 'batch-789',
    documentHash: 'hash-abc',
    actorId: 'user-001',
  };

  beforeEach(async () => {
    mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-101' });

    mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
      $queryRaw: jest.fn(),
      blockchainRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockBlockchainClient = {
      recordTraceability: jest.fn(),
      findOnChainRecord: jest.fn().mockResolvedValue(null),
    };

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        return defaultValue;
      }),
    };

    const mockCls = {
      get: jest.fn().mockReturnValue('req-test-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainQueueService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BlockchainClientService, useValue: mockBlockchainClient },
        { provide: ClsService, useValue: mockCls },
      ],
    }).compile();

    service = module.get<BlockchainQueueService>(BlockchainQueueService);
    const realQueue = (service as any).queue;
    if (realQueue && typeof realQueue.close === 'function') {
      try {
        await realQueue.close();
      } catch {
        // ignore
      }
    }
    // Replace internal queue.add with mock
    (service as any).queue = {
      add: mockQueueAdd,
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await service.onModuleDestroy();
  });

  describe('Transactional Outbox Atomicity (Directive 1)', () => {
    it('persists outbox record inside the caller transaction client tx', async () => {
      const mockTx = {
        blockchainRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'outbox-uuid-1',
            productId: 'prod-456',
            status: 'QUEUED',
          }),
        },
      };

      const record = await service.createOutboxRecord(mockTx as any, {
        productId: 'prod-456',
        batchId: 'batch-789',
        journeyId: 'journey-001',
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        data: { stage: 'PACKAGING', temp: 22 },
      });

      expect(mockTx.blockchainRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'prod-456',
            batchId: 'batch-789',
            journeyId: 'journey-001',
            action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
            status: 'QUEUED',
          }),
        }),
      );
      expect(record.id).toBe('outbox-uuid-1');
    });

    it('crash between commit and enqueue: record remains safely in PostgreSQL outbox and is recovered', async () => {
      // Simulate: Transaction committed to DB, but process crashes before enqueueOutboxRecord is invoked
      const committedOutboxRecord = {
        id: 'rec-crashed-before-enqueue',
        action: BlockchainJobType.CERTIFICATE_RECORD,
        certificateId: 'cert-crash-1',
        productId: 'prod-crash-1',
        batchId: null,
        data: { documentHash: 'hash-99', actorId: 'user-1' },
        status: 'QUEUED',
        retryCount: 0,
        updatedAt: new Date(Date.now() - 30000),
      };

      mockPrisma.blockchainRecord.findMany.mockResolvedValueOnce([committedOutboxRecord]);

      // Recovery worker runs
      const recovered = await service.recoverOutboxJobs();

      expect(recovered).toBe(1);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        BlockchainJobType.CERTIFICATE_RECORD,
        expect.objectContaining({
          certificateId: 'cert-crash-1',
          productId: 'prod-crash-1',
        }),
        expect.objectContaining({
          jobId: 'bc-rec-crashed-before-enqueue',
        }),
      );
    });
  });

  describe('Outbox Recovery & Lease Timeout (Directive 2)', () => {
    it('reclaims jobs stuck in PROCESSING past lease timeout (120s)', async () => {
      const stuckProcessingRecord = {
        id: 'rec-stuck-processing',
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        certificateId: null,
        productId: 'prod-stuck',
        batchId: 'batch-stuck',
        journeyId: 'journey-stuck-001',
        data: { stage: 'QUALITY_INSPECTION' },
        status: 'PROCESSING',
        retryCount: 0,
        updatedAt: new Date(Date.now() - 130000), // 130s ago (> 120s lease timeout)
      };

      mockPrisma.blockchainRecord.findMany.mockResolvedValueOnce([stuckProcessingRecord]);

      const recovered = await service.recoverOutboxJobs();

      expect(recovered).toBe(1);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        BlockchainJobType.SUPPLY_CHAIN_RECORD,
        expect.objectContaining({
          journeyId: 'journey-stuck-001',
          productId: 'prod-stuck',
        }),
        expect.objectContaining({
          jobId: 'bc-rec-stuck-processing',
        }),
      );
    });

    it('multi-worker concurrency: FOR UPDATE SKIP LOCKED prevents two workers from claiming the same record', async () => {
      const rawRecordsWorker1 = [
        {
          id: 'rec-worker-1',
          product_id: 'prod-1',
          certificate_id: 'cert-1',
          batch_id: null,
          journey_id: null,
          action: BlockchainJobType.CERTIFICATE_RECORD,
          data: { documentHash: 'hash-1' },
          status: 'QUEUED',
        },
      ];

      // Worker 1 executes queryRaw and locks rec-worker-1
      mockPrisma.$queryRaw.mockResolvedValueOnce(rawRecordsWorker1);

      const claimedWorker1 = await service.claimStuckOrPendingRecords(20);
      expect(claimedWorker1).toHaveLength(1);
      expect(claimedWorker1[0].id).toBe('rec-worker-1');

      // Worker 2 running concurrently gets empty result because row is locked / updated
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      const claimedWorker2 = await service.claimStuckOrPendingRecords(20);
      expect(claimedWorker2).toHaveLength(0);
    });

    it('recovers SUPPLY_CHAIN_RECORD with journeyId: null (e.g. BATCH_RELEASED) after DB commit and Redis failure', async () => {
      const batchReleasedOutboxRecord = {
        id: 'rec-batch-released-001',
        action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        certificateId: null,
        productId: 'prod-batch-rel',
        batchId: 'batch-rel-001',
        journeyId: null,
        data: {
          action: 'BATCH_RELEASED',
          batchId: 'batch-rel-001',
          referenceCode: 'EXP-LOT-001',
          releasedBy: 'user-qa-uuid',
        },
        status: 'QUEUED',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(Date.now() - 30000), // 30s ago (> 10s queued cutoff)
      };

      // 1. Initial attempt: DB committed outbox record, but Redis failed on enqueue
      mockQueueAdd.mockRejectedValueOnce(new Error('ECONNREFUSED: Redis down on initial enqueue'));
      await expect(
        service.enqueueOutboxRecord('rec-batch-released-001', {
          type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
          productId: 'prod-batch-rel',
          batchId: 'batch-rel-001',
          journeyId: null,
          payload: batchReleasedOutboxRecord.data as any,
          actorId: 'user-qa-uuid',
        }),
      ).resolves.not.toThrow();

      // 2. Recovery worker runs: claims QUEUED record with journeyId: null
      mockPrisma.blockchainRecord.findMany.mockResolvedValueOnce([batchReleasedOutboxRecord]);

      // Redis is now back online
      mockQueueAdd.mockResolvedValueOnce({ id: 'job-recovered-rel' } as any);

      const recovered = await service.recoverOutboxJobs();

      expect(recovered).toBe(1);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        BlockchainJobType.SUPPLY_CHAIN_RECORD,
        expect.objectContaining({
          type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
          productId: 'prod-batch-rel',
          batchId: 'batch-rel-001',
          journeyId: null,
        }),
        expect.objectContaining({
          jobId: 'bc-rec-batch-released-001',
        }),
      );

      // 3. Worker picks up job from queue and processes it on-chain
      mockPrisma.blockchainRecord.findFirst.mockResolvedValueOnce(batchReleasedOutboxRecord);
      mockBlockchainClient.findOnChainRecord.mockResolvedValueOnce(null);
      mockBlockchainClient.recordTraceability.mockResolvedValueOnce({
        transactionHash: '0xrel_confirmed_hash_111',
        blockHash: '0xrel_block_hash',
        blockNumber: BigInt(1234),
        gasUsed: BigInt(25000),
        walletAddress: '0xwallet',
        contractAddress: '0xcontract',
        chainId: 80002,
        explorerUrl: 'https://amoy.polygonscan.com/tx/0xrel_confirmed_hash_111',
        receipt: { status: 1 },
        confirmations: 1,
        confirmedAt: new Date(),
      });

      await service.processTraceabilityJob({
        type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        productId: 'prod-batch-rel',
        batchId: 'batch-rel-001',
        journeyId: null,
        payload: batchReleasedOutboxRecord.data as any,
        actorId: 'user-qa-uuid',
      });

      expect(mockPrisma.blockchainRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-batch-released-001' },
          data: expect.objectContaining({
            transactionHash: '0xrel_confirmed_hash_111',
            status: 'CONFIRMED',
          }),
        }),
      );
    });
  });

  describe('On-Chain Reconciliation & Breakpoint Resilience (Directive 3)', () => {
    it('Breakpoint 1 (Redis failure on enqueue): job remains safely in DB outbox without throwing', async () => {
      mockPrisma.blockchainRecord.findFirst.mockResolvedValue(null);
      mockPrisma.blockchainRecord.create.mockResolvedValue({
        id: 'rec-uuid-2',
        productId: sampleCertData.productId,
        certificateId: sampleCertData.certificateId,
        status: 'QUEUED',
        createdAt: new Date(),
      });

      mockQueueAdd.mockRejectedValueOnce(new Error('ECONNREFUSED: Redis down'));

      await expect(service.addCertificateRecordJob(sampleCertData)).resolves.not.toThrow();
      expect(mockPrisma.blockchainRecord.create).toHaveBeenCalled();
    });

    it('Breakpoint 2 (Crash after blockchain mined tx, before DB update): on retry, recovers authentic txHash from receipt/log without re-broadcasting', async () => {
      const pendingRecord = {
        id: 'rec-pending-crash',
        productId: sampleCertData.productId,
        certificateId: sampleCertData.certificateId,
        status: 'PROCESSING',
        transactionHash: null,
        createdAt: new Date(),
      };

      mockPrisma.blockchainRecord.findFirst.mockResolvedValue(pendingRecord);

      // findOnChainRecord returns the authentic mined transaction details from on-chain event receipt
      mockBlockchainClient.findOnChainRecord.mockResolvedValueOnce({
        transactionHash: '0xauthentic_mined_hash_777',
        blockNumber: BigInt(500),
        blockHash: '0xblock_hash_888',
        confirmedAt: new Date(),
        confirmations: 12,
        receipt: { status: 'SUCCESS' },
      });

      await service.processTraceabilityJob({
        type: BlockchainJobType.CERTIFICATE_RECORD,
        ...sampleCertData,
      });

      // Must NOT submit duplicate broadcast
      expect(mockBlockchainClient.recordTraceability).not.toHaveBeenCalled();

      // DB record updated with genuine transactionHash
      expect(mockPrisma.blockchainRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-pending-crash' },
          data: expect.objectContaining({
            transactionHash: '0xauthentic_mined_hash_777',
            status: 'CONFIRMED',
          }),
        }),
      );
    });

    it('Breakpoint 3 (Record already CONFIRMED in DB): retry immediately skips without querying chain or broadcasting', async () => {
      const existingConfirmedRecord = {
        id: 'rec-confirmed',
        productId: sampleCertData.productId,
        certificateId: sampleCertData.certificateId,
        status: 'CONFIRMED',
        transactionHash: '0xabc123456789',
        createdAt: new Date(),
      };

      mockPrisma.blockchainRecord.findFirst.mockResolvedValue(existingConfirmedRecord);

      await service.addCertificateRecordJob(sampleCertData);
      expect(mockQueueAdd).not.toHaveBeenCalled();

      await service.processTraceabilityJob({
        type: BlockchainJobType.CERTIFICATE_RECORD,
        ...sampleCertData,
      });

      expect(mockBlockchainClient.recordTraceability).not.toHaveBeenCalled();
      expect(mockBlockchainClient.findOnChainRecord).not.toHaveBeenCalled();
    });

    it('Breakpoint 4 (RPC query failure during reconciliation): retains uncertain status and aborts broadcast to prevent duplicate transactions', async () => {
      const pendingRecord = {
        id: 'rec-rpc-timeout',
        productId: sampleCertData.productId,
        certificateId: sampleCertData.certificateId,
        status: 'PROCESSING',
        transactionHash: null,
        createdAt: new Date(),
      };

      mockPrisma.blockchainRecord.findFirst.mockResolvedValue(pendingRecord);

      // Simulate RPC provider failure during findOnChainRecord
      mockBlockchainClient.findOnChainRecord.mockRejectedValueOnce(
        new Error('RPC_QUERY_FAILED: Provider network timeout'),
      );

      await expect(
        service.processTraceabilityJob({
          type: BlockchainJobType.CERTIFICATE_RECORD,
          ...sampleCertData,
        }),
      ).rejects.toThrow('RPC_QUERY_FAILED');

      // CRITICAL: recordTraceability MUST NOT be called! We cannot broadcast when chain state is uncertain
      expect(mockBlockchainClient.recordTraceability).not.toHaveBeenCalled();

      // DB record retains status (does not mark FAILED or CONFIRMED), records error message and lastCheckedAt
      expect(mockPrisma.blockchainRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-rpc-timeout' },
          data: expect.objectContaining({
            lastCheckedAt: expect.any(Date),
            errorMessage: expect.stringContaining('RPC reconciliation failed: RPC_QUERY_FAILED'),
          }),
        }),
      );
    });

    it('Breakpoint 5 (Crash before broadcast): nothing on-chain, safely broadcasts and confirms', async () => {
      const pendingRecord = {
        id: 'rec-crashed-pre-broadcast',
        productId: sampleCertData.productId,
        certificateId: sampleCertData.certificateId,
        status: 'QUEUED',
        transactionHash: null,
        createdAt: new Date(),
      };

      mockPrisma.blockchainRecord.findFirst.mockResolvedValue(pendingRecord);
      // No existing record on chain
      mockBlockchainClient.findOnChainRecord.mockResolvedValueOnce(null);

      // Blockchain broadcasts successfully
      mockBlockchainClient.recordTraceability.mockResolvedValueOnce({
        transactionHash: '0xbroadcast_tx_hash_999',
        blockHash: '0xblock_hash_999',
        blockNumber: BigInt(600),
        gasUsed: BigInt(21000),
        walletAddress: '0xwallet',
        contractAddress: '0xcontract',
        chainId: 31337,
        explorerUrl: 'https://testnet/tx/0xbroadcast_tx_hash_999',
        receipt: { status: 1 },
        confirmations: 1,
        confirmedAt: new Date(),
      });

      await service.processTraceabilityJob({
        type: BlockchainJobType.CERTIFICATE_RECORD,
        ...sampleCertData,
      });

      // recordTraceability must be called once
      expect(mockBlockchainClient.recordTraceability).toHaveBeenCalledTimes(1);

      // Record is confirmed
      expect(mockPrisma.blockchainRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-crashed-pre-broadcast' },
          data: expect.objectContaining({
            transactionHash: '0xbroadcast_tx_hash_999',
            status: 'CONFIRMED',
          }),
        }),
      );
    });
  });
});
