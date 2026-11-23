import { Injectable, Logger, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Job, Queue } from 'bullmq';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { BlockchainClientService } from '../blockchain/blockchain-client.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BLOCKCHAIN_QUEUE_NAME,
  BlockchainJobType,
  blockchainJobOptions,
  createBlockchainQueueConnection,
} from './blockchain.queue';
import {
  BlockchainDashboardResponseDto,
  BlockchainJobData,
  BlockchainJobResponseDto,
  BlockchainJobsResponseDto,
  CertificateRecordJobData,
  SupplyChainRecordJobData,
} from './dto/blockchain-job.dto';

@Injectable()
export class BlockchainQueueService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(BlockchainQueueService.name);
  private readonly queue: Queue<BlockchainJobData>;
  private isClosing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly blockchainClientService: BlockchainClientService,
    private readonly cls: ClsService,
  ) {
    const connection = createBlockchainQueueConnection(this.configService);
    const connectionLog = connection as {
      host?: string;
      port?: number;
      tls?: unknown;
    };
    this.logger.log(
      `Blockchain queue initializing: queue=${BLOCKCHAIN_QUEUE_NAME} host=${connectionLog.host} port=${connectionLog.port} tls=${connectionLog.tls ? 'enabled' : 'disabled'}`,
    );

    this.queue = new Queue<BlockchainJobData>(BLOCKCHAIN_QUEUE_NAME, {
      connection,
      defaultJobOptions: blockchainJobOptions,
    });

    this.queue.on('error', (error) => {
      if (this.isClosing || error.message?.includes('Connection is closed')) {
        return;
      }
      this.logger.warn(`Blockchain queue error: ${error.message}`);
    });

    (this.queue as any).connection?.on('error', (error: any) => {
      if (this.isClosing || error.message?.includes('Connection is closed')) {
        return;
      }
      this.logger.warn(`Blockchain queue connection error: ${error.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.queue.waitUntilReady();
    } catch (err: any) {
      this.logger.warn(`Blockchain queue wait until ready: ${err?.message}`);
    }

    // Trigger immediate outbox recovery sweep on startup/restart
    try {
      await this.recoverOutboxJobs();
    } catch (err: any) {
      this.logger.warn(`Startup outbox recovery error: ${err?.message}`);
    }
  }

  async onModuleDestroy() {
    this.isClosing = true;
    try {
      await this.queue.close();
    } catch {
      // ignore
    }
  }

  async onApplicationShutdown() {
    await this.onModuleDestroy();
  }

  /**
   * Transactional Outbox: Writes the blockchain audit record inside the caller's Prisma transaction
   */
  async createOutboxRecord(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      certificateId?: string | null;
      batchId?: string | null;
      journeyId?: string | null;
      action: BlockchainJobType;
      data: Prisma.InputJsonValue;
    },
  ) {
    const lastRecord = await tx.blockchainRecord.findFirst({
      where: { productId: params.productId },
      orderBy: { createdAt: 'desc' },
    });
    const previousHash = lastRecord?.hash ?? 'GENESIS_BLOCK_0000000000000000';
    const createdAt = new Date();
    const hash = createHash('sha256')
      .update(
        `${previousHash}${JSON.stringify(params.data)}${createdAt.toISOString()}`,
      )
      .digest('hex');

    return tx.blockchainRecord.create({
      data: {
        productId: params.productId,
        certificateId: params.certificateId ?? null,
        batchId: params.batchId ?? null,
        journeyId: params.journeyId ?? null,
        action: String(params.action),
        data: params.data,
        previousHash,
        hash,
        status: 'QUEUED',
        createdAt,
      },
    });
  }

  async enqueueOutboxRecord(
    recordId: string,
    data: BlockchainJobData,
  ): Promise<boolean> {
    return this.addJob(data, recordId);
  }

  async addCertificateRecordJob(
    data: Omit<CertificateRecordJobData, 'type' | 'reqId'>,
  ): Promise<void> {
    const payload: Prisma.InputJsonObject = {
      certificateId: data.certificateId,
      productId: data.productId,
      batchId: data.batchId ?? null,
      documentHash: data.documentHash,
      actorId: data.actorId,
    };

    // 1. Transactional Outbox: Persist record safely in PostgreSQL before attempting Redis enqueue
    const record = await this.upsertQueuedRecord({
      productId: data.productId,
      certificateId: data.certificateId,
      batchId: data.batchId ?? null,
      journeyId: null,
      action: BlockchainJobType.CERTIFICATE_RECORD,
      data: payload,
    });

    if (record.status === 'CONFIRMED' || record.transactionHash) {
      this.logger.log(
        `Certificate ${data.certificateId} is already CONFIRMED on blockchain. Skipping duplicate enqueue.`,
      );
      return;
    }

    // 2. Enqueue with deterministic jobId
    await this.addJob(
      {
        type: BlockchainJobType.CERTIFICATE_RECORD,
        reqId: this.cls.get('reqId'),
        ...data,
      },
      record.id,
    );
  }

  async addSupplyChainRecordJob(
    data: Omit<SupplyChainRecordJobData, 'type' | 'reqId'>,
  ): Promise<void> {
    // 1. Transactional Outbox: Persist record safely in PostgreSQL before attempting Redis enqueue
    const record = await this.upsertQueuedRecord({
      productId: data.productId,
      certificateId: null,
      batchId: data.batchId,
      journeyId: data.journeyId ?? null,
      action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      data: data.payload,
    });

    if (record.status === 'CONFIRMED' || record.transactionHash) {
      this.logger.log(
        `Supply chain journey ${data.journeyId} is already CONFIRMED on blockchain. Skipping duplicate enqueue.`,
      );
      return;
    }

    // 2. Enqueue with deterministic jobId
    await this.addJob(
      {
        type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
        reqId: this.cls.get('reqId'),
        ...data,
      },
      record.id,
    );
  }

  async processTraceabilityJob(data: BlockchainJobData): Promise<void> {
    if (data.type === BlockchainJobType.CERTIFICATE_RECORD) {
      await this.processCertificateRecord(data);
      return;
    }

    await this.processSupplyChainRecord(data);
  }

  async getJobs(): Promise<BlockchainJobsResponseDto> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getJobs(['waiting'], 0, 50),
      this.queue.getJobs(['active'], 0, 50),
      this.queue.getJobs(['completed'], 0, 50),
      this.queue.getJobs(['failed'], 0, 50),
    ]);

    return {
      waiting: await this.mapJobs(waiting),
      active: await this.mapJobs(active),
      completed: await this.mapJobs(completed),
      failed: await this.mapJobs(failed),
    };
  }

  async getJob(id: string): Promise<BlockchainJobResponseDto | null> {
    const job = await this.queue.getJob(id);
    if (!job) {
      return null;
    }

    return this.mapJob(job);
  }

  async getDashboard(): Promise<BlockchainDashboardResponseDto> {
    const [counts, delayedJobs] = await Promise.all([
      this.queue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      this.queue.getJobs(['delayed'], 0, 500),
    ]);

    return {
      waitingJobs: counts.waiting ?? 0,
      activeJobs: counts.active ?? 0,
      completedJobs: counts.completed ?? 0,
      failedJobs: counts.failed ?? 0,
      retryJobs: delayedJobs.filter((job) => job.attemptsMade > 0).length,
    };
  }

  private async addJob(
    data: BlockchainJobData,
    recordId?: string,
  ): Promise<boolean> {
    const jobId = recordId ? `bc-${recordId}` : undefined;
    try {
      const job = await this.queue.add(data.type, data, {
        ...blockchainJobOptions,
        ...(jobId ? { jobId } : {}),
      });
      this.logger.log(
        `Job Created: queue=${BLOCKCHAIN_QUEUE_NAME} id=${job.id} type=${data.type}`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Redis unavailable when enqueueing job type=${data.type} (recordId=${recordId ?? 'unknown'}). Job remains safely in PostgreSQL outbox.`,
        error,
      );
      return false;
    }
  }

  private async processCertificateRecord(
    data: CertificateRecordJobData,
  ): Promise<void> {
    this.logger.log(
      `Queue Received: type=${data.type} certificateId=${data.certificateId}`,
    );

    const payload: Prisma.InputJsonObject = {
      certificateId: data.certificateId,
      productId: data.productId,
      batchId: data.batchId ?? null,
      documentHash: data.documentHash,
      actorId: data.actorId,
    };

    await this.processOnChain({
      productId: data.productId,
      certificateId: data.certificateId,
      batchId: data.batchId ?? null,
      journeyId: null,
      action: BlockchainJobType.CERTIFICATE_RECORD,
      data: payload,
      documentHash: data.documentHash,
    });
  }

  private async processSupplyChainRecord(
    data: SupplyChainRecordJobData,
  ): Promise<void> {
    this.logger.log(
      `Queue Received: type=${data.type} journeyId=${data.journeyId}`,
    );

    await this.processOnChain({
      productId: data.productId,
      certificateId: null,
      batchId: data.batchId,
      journeyId: data.journeyId ?? null,
      action: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      data: data.payload,
      documentHash: null,
    });
  }

  private async processOnChain(params: {
    productId: string;
    certificateId: string | null;
    batchId: string | null;
    journeyId: string | null;
    action: BlockchainJobType;
    data: Prisma.InputJsonValue;
    documentHash: string | null;
  }) {
    const record = await this.upsertQueuedRecord(params);

    // Idempotency: If this record is already CONFIRMED on chain, never mint a duplicate
    if (record.status === 'CONFIRMED') {
      this.logger.log(
        `Record ${record.id} already CONFIRMED on chain (tx: ${record.transactionHash}). Skipping duplicate blockchain transaction.`,
      );
      return;
    }

    // Breakpoint Recovery: Check if the blockchain already has this record (e.g. previous worker crashed right after broadcast)
    const metadataHash = this.hashMetadata(params.data);
    let existingOnChain;
    try {
      existingOnChain = await this.blockchainClientService.findOnChainRecord({
        productId: params.productId,
        batchId: params.batchId,
        metadataHash,
        documentHash: params.documentHash,
        action: String(params.action),
        knownTxHash: record.transactionHash || record.txId,
      });
    } catch (rpcError: any) {
      // Directive 3: "Nếu RPC truy vấn thất bại, giữ trạng thái chưa xác định và không tự gửi giao dịch lần hai."
      const rpcErrMsg =
        rpcError instanceof Error ? rpcError.message : String(rpcError);
      this.logger.warn(
        `RPC query failed during reconciliation for record ${record.id}: ${rpcErrMsg}. Retaining uncertain status and skipping broadcast.`,
      );
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          lastCheckedAt: new Date(),
          errorMessage: `RPC reconciliation failed: ${rpcErrMsg}`,
        },
      });
      throw rpcError;
    }

    if (existingOnChain) {
      const isReverted =
        existingOnChain.status === 0 ||
        existingOnChain.receipt?.status === 0 ||
        existingOnChain.receipt?.status === '0' ||
        existingOnChain.receipt?.status === '0x0';

      if (isReverted) {
        this.logger.error(
          `Record ${record.id} reverted on chain (status === 0, tx: ${existingOnChain.transactionHash}). Marking as FAILED. Absolutely never CONFIRMED.`,
        );
        await this.prisma.blockchainRecord.update({
          where: { id: record.id },
          data: {
            txId: existingOnChain.transactionHash,
            transactionHash: existingOnChain.transactionHash,
            blockHash: existingOnChain.blockHash,
            blockNumber: existingOnChain.blockNumber,
            gasUsed: existingOnChain.gasUsed,
            walletAddress: existingOnChain.walletAddress,
            contractAddress: existingOnChain.contractAddress,
            chainId: existingOnChain.chainId,
            explorerUrl: existingOnChain.explorerUrl,
            receipt: existingOnChain.receipt as Prisma.InputJsonObject,
            confirmations: existingOnChain.confirmations,
            status: 'FAILED',
            errorMessage: 'TRANSACTION_REVERTED_ON_CHAIN',
            lastCheckedAt: new Date(),
          },
        });
        return;
      }

      this.logger.log(
        `Record ${record.id} was already mined on chain (${existingOnChain.transactionHash}). Recovering status without submitting duplicate transaction.`,
      );
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          txId: existingOnChain.transactionHash,
          transactionHash: existingOnChain.transactionHash,
          blockHash: existingOnChain.blockHash,
          blockNumber: existingOnChain.blockNumber,
          gasUsed: existingOnChain.gasUsed,
          walletAddress: existingOnChain.walletAddress,
          contractAddress: existingOnChain.contractAddress,
          chainId: existingOnChain.chainId,
          explorerUrl: existingOnChain.explorerUrl,
          receipt: existingOnChain.receipt as Prisma.InputJsonObject,
          confirmations: existingOnChain.confirmations,
          status: 'CONFIRMED',
          confirmedAt: existingOnChain.confirmedAt,
          errorMessage: null,
          lastCheckedAt: new Date(),
        },
      });
      return;
    }

    await this.markProcessing(record.id, params.data);

    try {
      const result = await this.blockchainClientService.recordTraceability(
        {
          productId: params.productId,
          batchId: params.batchId,
          metadataHash,
          documentHash: params.documentHash,
          action: params.action,
        },
        async (txHash: string) => {
          // Immediately persist broadcast txHash before awaiting confirmation
          await this.prisma.blockchainRecord.update({
            where: { id: record.id },
            data: {
              txId: txHash,
              transactionHash: txHash,
              status: 'PROCESSING',
              lastCheckedAt: new Date(),
            },
          });
        },
      );

      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          txId: result.transactionHash,
          transactionHash: result.transactionHash,
          blockHash: result.blockHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          walletAddress: result.walletAddress,
          contractAddress: result.contractAddress,
          chainId: result.chainId,
          explorerUrl: result.explorerUrl,
          receipt: result.receipt as Prisma.InputJsonObject,
          confirmations: result.confirmations,
          confirmationLatencyMs: record.createdAt
            ? result.confirmedAt.getTime() - record.createdAt.getTime()
            : 0,
          lastCheckedAt: new Date(),
          retryCount: 0,
          status: 'CONFIRMED',
          confirmedAt: result.confirmedAt,
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown blockchain transaction error';
      this.logger.error(
        `Transaction Failed: record=${record.id} reason=${errorMessage}`,
      );
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorMessage,
          retryCount: { increment: 1 },
        },
      });
      throw error;
    }
  }

  private async upsertQueuedRecord(params: {
    productId: string;
    certificateId: string | null;
    batchId: string | null;
    journeyId: string | null;
    action: BlockchainJobType;
    data: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.blockchainRecord.findFirst({
      where: {
        action: params.action,
        productId: params.productId,
        ...(params.batchId ? { batchId: params.batchId } : {}),
        ...(params.certificateId
          ? { certificateId: params.certificateId }
          : {}),
        ...(params.journeyId ? { journeyId: params.journeyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // If already CONFIRMED, do not reset to QUEUED
      if (existing.status === 'CONFIRMED' || existing.transactionHash) {
        return existing;
      }

      await this.prisma.blockchainRecord.update({
        where: { id: existing.id },
        data: {
          status: 'QUEUED',
          errorMessage: null,
          data: params.data,
        },
      });
      return existing;
    }

    const lastRecord = await this.prisma.blockchainRecord.findFirst({
      where: { productId: params.productId },
      orderBy: { createdAt: 'desc' },
    });
    const previousHash = lastRecord?.hash ?? 'GENESIS_BLOCK_0000000000000000';
    const createdAt = new Date();
    const hash = createHash('sha256')
      .update(
        `${previousHash}${JSON.stringify(params.data)}${createdAt.toISOString()}`,
      )
      .digest('hex');

    return this.prisma.blockchainRecord.create({
      data: {
        productId: params.productId,
        certificateId: params.certificateId,
        batchId: params.batchId,
        journeyId: params.journeyId,
        action: params.action,
        data: params.data,
        previousHash,
        hash,
        txId: null,
        status: 'QUEUED',
        createdAt,
      },
    });
  }

  /**
   * Concurrency-safe outbox claiming with lease timeout and FOR UPDATE SKIP LOCKED.
   * Reclaims:
   *  1. QUEUED / FAILED records older than 10s
   *  2. PROCESSING records older than 120s (lease timeout for crashed workers)
   */
  async claimStuckOrPendingRecords(
    limit = 20,
    customLeaseCutoff?: Date,
  ): Promise<
    Array<{
      id: string;
      productId: string;
      certificateId: string | null;
      batchId: string | null;
      journeyId: string | null;
      action: string;
      data: Prisma.InputJsonValue;
      status: string;
      transactionHash: string | null;
    }>
  > {
    const queuedCutoff = new Date(Date.now() - 10000);
    const leaseTimeoutMs = this.configService.get<number>(
      'BLOCKCHAIN_LEASE_TIMEOUT_MS',
      120000,
    );
    const leaseCutoff =
      customLeaseCutoff ?? new Date(Date.now() - leaseTimeoutMs);

    if (
      typeof (this.prisma as any).$queryRaw === 'function' &&
      typeof (this.prisma as any).$transaction === 'function'
    ) {
      try {
        const rawResult = await this.prisma.$transaction(async (tx) => {
          const records = await tx.$queryRaw<
            Array<{
              id: string;
              product_id: string;
              certificate_id: string | null;
              batch_id: string | null;
              journey_id: string | null;
              action: string;
              data: Prisma.InputJsonValue;
              status: string;
              transaction_hash: string | null;
            }>
          >`
            SELECT id, product_id, certificate_id, batch_id, journey_id, action, data, status, transaction_hash
            FROM blockchain_records
            WHERE (
              (status IN ('QUEUED', 'FAILED') AND updated_at < ${queuedCutoff})
              OR
              (status = 'PROCESSING' AND updated_at < ${leaseCutoff})
            )
            AND retry_count < 5
            ORDER BY updated_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          `;

          if (!Array.isArray(records)) {
            return null;
          }

          if (records.length === 0) {
            return [];
          }

          const ids = records.map((r) => r.id);
          await tx.blockchainRecord.updateMany({
            where: { id: { in: ids } },
            data: { updatedAt: new Date() },
          });

          return records.map((r) => ({
            id: r.id,
            productId: r.product_id,
            certificateId: r.certificate_id,
            batchId: r.batch_id,
            journeyId: r.journey_id,
            action: r.action,
            data: r.data,
            status: r.status,
            transactionHash: r.transaction_hash,
          }));
        });

        if (rawResult !== null) {
          return rawResult;
        }
      } catch (err: any) {
        this.logger.warn(
          `claimStuckOrPendingRecords raw query fallback: ${err?.message}`,
        );
      }
    }

    const records = await this.prisma.blockchainRecord.findMany({
      where: {
        OR: [
          { status: { in: ['QUEUED', 'FAILED'] }, updatedAt: { lt: queuedCutoff } },
          { status: 'PROCESSING', updatedAt: { lt: leaseCutoff } },
        ],
        retryCount: { lt: 5 },
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    if (records.length > 0) {
      const ids = records.map((r) => r.id);
      await this.prisma.blockchainRecord.updateMany({
        where: { id: { in: ids } },
        data: { updatedAt: new Date() },
      });
    }

    return records.map((r) => ({
      id: r.id,
      productId: r.productId,
      certificateId: r.certificateId,
      batchId: r.batchId,
      journeyId: r.journeyId,
      action: r.action,
      data: r.data as unknown as Prisma.InputJsonValue,
      status: r.status,
      transactionHash: r.transactionHash,
    }));
  }

  /**
   * Outbox recovery worker: runs periodically to pick up any QUEUED/FAILED records
   * that failed to enqueue to Redis, or stuck PROCESSING records past lease timeout.
   */
  @Interval(15000)
  async recoverOutboxJobs(customLeaseCutoff?: Date): Promise<number> {
    if (this.isClosing) {
      return 0;
    }
    try {
      const pendingRecords = await this.claimStuckOrPendingRecords(
        20,
        customLeaseCutoff,
      );

      if (pendingRecords.length === 0) return 0;

      let recoveredCount = 0;
      for (const record of pendingRecords) {
        try {
          // If transactionHash exists on a stuck PROCESSING record:
          // Reconcile receipt and confirm or update status without re-enqueueing duplicate broadcast
          if (record.status === 'PROCESSING' && record.transactionHash) {
            const recovered = await this.reconcileStuckProcessingRecord(record);
            if (recovered) {
              recoveredCount++;
            }
            continue;
          }

          const actionStr: string = record.action;
          if (
            actionStr === String(BlockchainJobType.CERTIFICATE_RECORD) &&
            record.certificateId
          ) {
            const dataObj =
              record.data && typeof record.data === 'object'
                ? (record.data as Record<string, unknown>)
                : {};
            const documentHash =
              typeof dataObj.documentHash === 'string'
                ? dataObj.documentHash
                : '';
            const actorId =
              typeof dataObj.actorId === 'string' ? dataObj.actorId : '';
            const success = await this.addJob(
              {
                type: BlockchainJobType.CERTIFICATE_RECORD,
                reqId: this.cls.get('reqId'),
                certificateId: record.certificateId,
                productId: record.productId,
                batchId: record.batchId ?? undefined,
                documentHash,
                actorId,
              },
              record.id,
            );
            if (success) {
              recoveredCount++;
            }
          } else if (
            actionStr === String(BlockchainJobType.SUPPLY_CHAIN_RECORD)
          ) {
            const dataObj =
              record.data && typeof record.data === 'object'
                ? (record.data as Record<string, unknown>)
                : {};
            const actorId =
              typeof dataObj.actorId === 'string' ? dataObj.actorId : '';
            const success = await this.addJob(
              {
                type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
                reqId: this.cls.get('reqId'),
                productId: record.productId,
                batchId: record.batchId ?? '',
                journeyId: record.journeyId ?? null,
                payload: (record.data ?? {}) as Prisma.InputJsonObject,
                actorId,
              },
              record.id,
            );
            if (success) {
              recoveredCount++;
            }
          }
        } catch (jobErr) {
          this.logger.warn(
            `Failed to recover outbox record ${record.id}:`,
            jobErr,
          );
        }
      }

      if (recoveredCount > 0) {
        this.logger.log(
          `Recovered and processed ${recoveredCount} pending blockchain outbox records.`,
        );
      }
      return recoveredCount;
    } catch {
      return 0;
    }
  }

  async reconcileStuckProcessingRecord(record: {
    id: string;
    productId: string;
    certificateId: string | null;
    batchId: string | null;
    journeyId: string | null;
    action: string;
    data: Prisma.InputJsonValue;
    status: string;
    transactionHash: string | null;
  }): Promise<boolean> {
    if (!record.transactionHash) return false;

    this.logger.log(
      `Reconciling stuck PROCESSING record ${record.id} with transactionHash: ${record.transactionHash}`,
    );

    const metadataHash = this.hashMetadata(record.data);
    let documentHash: string | null = null;
    if (
      record.data &&
      typeof record.data === 'object' &&
      'documentHash' in (record.data as Record<string, unknown>)
    ) {
      documentHash = String(
        (record.data as Record<string, unknown>).documentHash || '',
      );
    }

    try {
      const existing = await this.blockchainClientService.findOnChainRecord({
        productId: record.productId,
        batchId: record.batchId,
        metadataHash,
        documentHash,
        action: record.action,
        knownTxHash: record.transactionHash,
      });

      if (existing) {
        const isReverted =
          existing.status === 0 ||
          existing.receipt?.status === 0 ||
          existing.receipt?.status === '0' ||
          existing.receipt?.status === '0x0';

        if (isReverted) {
          await this.prisma.blockchainRecord.update({
            where: { id: record.id },
            data: {
              status: 'FAILED',
              txId: existing.transactionHash,
              transactionHash: existing.transactionHash,
              blockHash: existing.blockHash,
              blockNumber: existing.blockNumber,
              gasUsed: existing.gasUsed,
              walletAddress: existing.walletAddress,
              contractAddress: existing.contractAddress,
              chainId: existing.chainId,
              explorerUrl: existing.explorerUrl,
              receipt: existing.receipt as Prisma.InputJsonObject,
              confirmations: existing.confirmations,
              confirmedAt: existing.confirmedAt,
              errorMessage: 'TRANSACTION_REVERTED_ON_CHAIN',
              lastCheckedAt: new Date(),
            },
          });
          this.logger.error(
            `Stuck record ${record.id} with txHash ${record.transactionHash} reverted on chain (status === 0). Transitioned to FAILED (never CONFIRMED).`,
          );
          return true;
        }

        await this.prisma.blockchainRecord.update({
          where: { id: record.id },
          data: {
            status: 'CONFIRMED',
            txId: existing.transactionHash,
            transactionHash: existing.transactionHash,
            blockHash: existing.blockHash,
            blockNumber: existing.blockNumber,
            gasUsed: existing.gasUsed,
            walletAddress: existing.walletAddress,
            contractAddress: existing.contractAddress,
            chainId: existing.chainId,
            explorerUrl: existing.explorerUrl,
            receipt: existing.receipt as Prisma.InputJsonObject,
            confirmations: existing.confirmations,
            confirmedAt: existing.confirmedAt,
            errorMessage: null,
            lastCheckedAt: new Date(),
          },
        });
        this.logger.log(
          `Successfully recovered and confirmed stuck record ${record.id} via on-chain receipt (${existing.transactionHash})`,
        );
        return true;
      }
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('PENDING_MEMPOOL_TRANSACTION')) {
        this.logger.log(
          `Record ${record.id} transaction ${record.transactionHash} still pending in mempool. Refreshing lease.`,
        );
        await this.prisma.blockchainRecord.update({
          where: { id: record.id },
          data: {
            lastCheckedAt: new Date(),
            errorMessage:
              'Transaction pending in mempool, awaiting confirmation',
          },
        });
        return true;
      }

      this.logger.warn(
        `RPC query failed during recovery reconciliation for record ${record.id}: ${errMsg}`,
      );
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          lastCheckedAt: new Date(),
          errorMessage: `RPC query failed during recovery: ${errMsg}`,
        },
      });
      return false;
    }

    const provider = this.blockchainClientService.getProvider();
    if (provider) {
      try {
        const receipt = await provider.getTransactionReceipt(
          record.transactionHash,
        );
        if (receipt && receipt.status === 0) {
          await this.prisma.blockchainRecord.update({
            where: { id: record.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Transaction reverted on-chain (status: 0)',
              lastCheckedAt: new Date(),
            },
          });
          this.logger.warn(
            `Record ${record.id} transaction ${record.transactionHash} reverted on chain. Marked as FAILED.`,
          );
          return true;
        }
      } catch {
        // ignore
      }
    }

    return false;
  }

  private async markProcessing(recordId: string, data: Prisma.InputJsonValue) {
    await this.prisma.blockchainRecord.update({
      where: { id: recordId },
      data: {
        status: 'PROCESSING',
        data,
        errorMessage: null,
      },
    });
  }

  private hashMetadata(data: Prisma.InputJsonValue) {
    return createHash('sha256')
      .update(this.stableStringify(data))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`).join(',')}}`;
  }

  private async mapJobs(
    jobs: Job<BlockchainJobData>[],
  ): Promise<BlockchainJobResponseDto[]> {
    return Promise.all(jobs.map((job) => this.mapJob(job)));
  }

  private async mapJob(
    job: Job<BlockchainJobData>,
  ): Promise<BlockchainJobResponseDto> {
    const record = await this.findBlockchainRecordForJob(job);
    const receipt =
      record?.receipt && typeof record.receipt === 'object'
        ? (record.receipt as Record<string, unknown>)
        : null;

    return {
      id: String(job.id),
      type: job.name,
      status: await job.getState(),
      attempts: job.attemptsMade,
      createdAt: job.timestamp ?? null,
      processedAt: job.processedOn ?? null,
      finishedAt: job.finishedOn ?? null,
      failedReason: job.failedReason ?? null,
      txHash: record?.transactionHash ?? null,
      blockNumber: record?.blockNumber?.toString() ?? null,
      blockchainStatus: record?.status ?? null,
      explorerUrl: record?.explorerUrl ?? null,
      receipt,
      gasUsed: record?.gasUsed?.toString() ?? null,
      confirmations: record?.confirmations ?? null,
    };
  }

  private findBlockchainRecordForJob(job: Job<BlockchainJobData>) {
    return this.prisma.blockchainRecord.findFirst({
      where: {
        action: job.name,
        ...(job.data.type === BlockchainJobType.CERTIFICATE_RECORD
          ? { certificateId: job.data.certificateId }
          : { journeyId: job.data.journeyId }),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
