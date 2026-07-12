import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import {
  BLOCKCHAIN_QUEUE_NAME,
  BlockchainJobType,
  createBlockchainQueueConnection,
} from './blockchain.queue';
import { BlockchainQueueService } from './blockchain-queue.service';
import { BlockchainJobData } from './dto/blockchain-job.dto';

@Injectable()
export class BlockchainProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainProcessor.name);
  private worker?: Worker<BlockchainJobData>;
  private readonly workerTimeoutMs = 60_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly blockchainQueueService: BlockchainQueueService,
    private readonly cls: ClsService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<BlockchainJobData>(
      BLOCKCHAIN_QUEUE_NAME,
      (job) => this.cls.run(() => {
        this.cls.set('reqId', job.data.reqId || randomUUID());
        return this.withTimeout(this.process(job), this.workerTimeoutMs);
      }),
      {
        connection: createBlockchainQueueConnection(this.configService),
        concurrency: 5,
      },
    );

    this.worker.on('active', (job) => {
       this.cls.run(() => {
         this.cls.set('reqId', job.data.reqId || randomUUID());
         this.onActive(job);
       });
    });
    this.worker.on('completed', (job) => {
       this.cls.run(() => {
         this.cls.set('reqId', job.data.reqId || randomUUID());
         this.onCompleted(job);
       });
    });
    this.worker.on('failed', (job, error) => {
       this.cls.run(() => {
         this.cls.set('reqId', job?.data.reqId || randomUUID());
         this.onFailed(job, error);
       });
    });
    this.worker.on('error', (error) => {
      this.logger.error('Queue Worker Error', error);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<BlockchainJobData>): Promise<void> {
    await this.blockchainQueueService.processTraceabilityJob(job.data);
  }

  private onActive(job: Job<BlockchainJobData>) {
    this.logger.log(`Job Started: id=${job.id} type=${job.name} attempt=${job.attemptsMade + 1}`);
  }

  private onCompleted(job: Job<BlockchainJobData>) {
    this.logger.log(`Job Completed: id=${job.id} type=${job.name}`);
  }

  private onFailed(job: Job<BlockchainJobData> | undefined, error: Error) {
    const jobInfo = job ? `id=${job.id} type=${job.name}` : 'id=unknown type=unknown';
    if (job && job.attemptsMade < (job.opts.attempts ?? 1)) {
      this.logger.warn(`Job Retry: ${jobInfo} attempts=${job.attemptsMade} reason=${error.message}`);
      return;
    }

    this.logger.error(`Job Failed: ${jobInfo} reason=${error.message}`);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Blockchain queue worker timeout')), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
