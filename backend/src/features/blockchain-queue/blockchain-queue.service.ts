import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
export class BlockchainQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(BlockchainQueueService.name);
  private readonly queue: Queue<BlockchainJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly blockchainClientService: BlockchainClientService,
    private readonly cls: ClsService,
  ) {
    this.queue = new Queue<BlockchainJobData>(BLOCKCHAIN_QUEUE_NAME, {
      connection: createBlockchainQueueConnection(this.configService),
      defaultJobOptions: blockchainJobOptions,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  async addCertificateRecordJob(data: Omit<CertificateRecordJobData, 'type' | 'reqId'>): Promise<void> {
    await this.addJob({
      type: BlockchainJobType.CERTIFICATE_RECORD,
      reqId: this.cls.get('reqId'),
      ...data,
    });
  }

  async addSupplyChainRecordJob(data: Omit<SupplyChainRecordJobData, 'type' | 'reqId'>): Promise<void> {
    await this.addJob({
      type: BlockchainJobType.SUPPLY_CHAIN_RECORD,
      reqId: this.cls.get('reqId'),
      ...data,
    });
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

  private async addJob(data: BlockchainJobData): Promise<void> {
    try {
      const job = await this.queue.add(data.type, data, blockchainJobOptions);
      this.logger.log(`Job Created: queue=${BLOCKCHAIN_QUEUE_NAME} id=${job.id} type=${data.type}`);
    } catch (error) {
      this.logger.error(`Job Failed To Create: type=${data.type}`, error);
    }
  }

  private async processCertificateRecord(data: CertificateRecordJobData): Promise<void> {
    this.logger.log(`Queue Received: type=${data.type} certificateId=${data.certificateId}`);

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

  private async processSupplyChainRecord(data: SupplyChainRecordJobData): Promise<void> {
    this.logger.log(`Queue Received: type=${data.type} journeyId=${data.journeyId}`);

    await this.processOnChain({
      productId: data.productId,
      certificateId: null,
      batchId: data.batchId,
      journeyId: data.journeyId,
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
    await this.markProcessing(record.id, params.data);

    try {
      const result = await this.blockchainClientService.recordTraceability({
        productId: params.productId,
        batchId: params.batchId,
        metadataHash: this.hashMetadata(params.data),
        documentHash: params.documentHash,
        action: params.action,
      });

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
          confirmationLatencyMs: result.confirmedAt.getTime() - record.createdAt.getTime(),
          lastCheckedAt: new Date(),
          retryCount: 0,
          status: 'CONFIRMED',
          confirmedAt: result.confirmedAt,
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown blockchain transaction error';
      this.logger.error(`Transaction Failed: record=${record.id} reason=${errorMessage}`);
      await this.prisma.blockchainRecord.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorMessage,
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
        ...(params.certificateId ? { certificateId: params.certificateId } : {}),
        ...(params.journeyId ? { journeyId: params.journeyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
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
      .update(`${previousHash}${JSON.stringify(params.data)}${createdAt.toISOString()}`)
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
    return createHash('sha256').update(this.stableStringify(data)).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`).join(',')}}`;
  }

  private async mapJobs(jobs: Job<BlockchainJobData>[]): Promise<BlockchainJobResponseDto[]> {
    return Promise.all(jobs.map((job) => this.mapJob(job)));
  }

  private async mapJob(job: Job<BlockchainJobData>): Promise<BlockchainJobResponseDto> {
    const record = await this.findBlockchainRecordForJob(job);
    const receipt = record?.receipt && typeof record.receipt === 'object'
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
