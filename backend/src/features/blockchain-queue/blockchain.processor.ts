import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import {
  BLOCKCHAIN_QUEUE_NAME,
  createBlockchainQueueConnection,
} from './blockchain.queue';
import { BlockchainQueueService } from './blockchain-queue.service';
import { BlockchainJobData } from './dto/blockchain-job.dto';

@Injectable()
export class BlockchainProcessor implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(BlockchainProcessor.name);
  private worker?: Worker<BlockchainJobData>;
  private isClosing = false;
  private readonly workerTimeoutMs = 60_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly blockchainQueueService: BlockchainQueueService,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit() {
    const connection = createBlockchainQueueConnection(this.configService);
    const connectionLog = connection as {
      host?: string;
      port?: number;
      tls?: unknown;
    };
    this.logger.log(
      `Blockchain queue worker initializing: queue=${BLOCKCHAIN_QUEUE_NAME} host=${connectionLog.host} port=${connectionLog.port} tls=${connectionLog.tls ? 'enabled' : 'disabled'}`,
    );

    this.worker = new Worker<BlockchainJobData>(
      BLOCKCHAIN_QUEUE_NAME,
      (job) =>
        this.cls.run(() => {
          this.cls.set('reqId', job.data.reqId || randomUUID());
          return this.withTimeout(this.process(job), this.workerTimeoutMs);
        }),
      {
        connection,
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
      if (this.isClosing || error.message?.includes('Connection is closed')) {
        return;
      }
      this.logWorkerError(error);
    });

    (this.worker as any).blockingConnection?.on('error', (error: any) => {
      if (this.isClosing || error.message?.includes('Connection is closed')) {
        return;
      }
      this.logger.warn(`Blockchain worker blocking connection error: ${error.message}`);
    });
    (this.worker as any).connection?.on('error', (error: any) => {
      if (this.isClosing || error.message?.includes('Connection is closed')) {
        return;
      }
      this.logger.warn(`Blockchain worker connection error: ${error.message}`);
    });

    try {
      await this.worker.waitUntilReady();
    } catch (err: any) {
      this.logger.warn(`Blockchain worker wait until ready: ${err?.message}`);
    }
  }

  async onModuleDestroy() {
    this.isClosing = true;
    if (this.worker) {
      try {
        await this.worker.close(true);
      } catch {
        // ignore close errors during teardown
      }
    }
  }

  async onApplicationShutdown() {
    await this.onModuleDestroy();
  }

  private async process(job: Job<BlockchainJobData>): Promise<void> {
    await this.blockchainQueueService.processTraceabilityJob(job.data);
  }

  private onActive(job: Job<BlockchainJobData>) {
    this.logger.log(
      `Job Started: id=${job.id} type=${job.name} attempt=${job.attemptsMade + 1}`,
    );
  }

  private onCompleted(job: Job<BlockchainJobData>) {
    this.logger.log(`Job Completed: id=${job.id} type=${job.name}`);
  }

  private onFailed(job: Job<BlockchainJobData> | undefined, error: Error) {
    const jobInfo = job
      ? `id=${job.id} type=${job.name}`
      : 'id=unknown type=unknown';
    if (job && job.attemptsMade < (job.opts.attempts ?? 1)) {
      this.logger.warn(
        `Job Failed (Will Retry): ${jobInfo} attempt=${job.attemptsMade} error=${error.message}`,
      );
      return;
    }

    this.logger.error(
      `Job Failed Permanently: ${jobInfo} attempts=${job?.attemptsMade ?? 'unknown'} error=${error.message}`,
      error.stack,
    );
  }

  private logWorkerError(error: Error & {
    code?: string;
    errno?: number;
    syscall?: string;
    hostname?: string;
    cause?: unknown;
  }) {
    this.logger.error(
      [
        'Queue Worker Error',
        `name=${error.name}`,
        `message=${error.message}`,
        error.code ? `code=${error.code}` : null,
        error.errno ? `errno=${error.errno}` : null,
        error.syscall ? `syscall=${error.syscall}` : null,
        error.hostname ? `hostname=${error.hostname}` : null,
        error.cause ? `cause=${JSON.stringify(error.cause)}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      error.stack,
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Blockchain queue worker timeout')),
        timeoutMs,
      );
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
