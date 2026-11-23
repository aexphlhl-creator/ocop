import { Controller, Get, Logger } from '@nestjs/common';
import {
  HealthCheckService,
  PrismaHealthIndicator,
  HealthCheck,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  BLOCKCHAIN_QUEUE_NAME,
  createBlockchainQueueConnection,
} from '../blockchain-queue/blockchain.queue';

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timer),
  );
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  @Get('live')
  checkLive() {
    return {
      status: 'ok',
      environment: this.configService.get<boolean>('DEMO_MODE', false)
        ? 'demo'
        : this.configService.get<string>('NODE_ENV', 'development'),
    };
  }

  @Get('ready')
  @HealthCheck()
  checkReady() {
    return this.health.check([
      () => {
        const dbTimeoutMs = Number(
          this.configService.get<number>('DATABASE_HEALTH_TIMEOUT_MS', 3000),
        );
        return withTimeout(
          this.prismaHealth.pingCheck('database', this.prisma),
          dbTimeoutMs,
          `Database health check timed out after ${dbTimeoutMs}ms`,
        );
      },
      async () => {
        const start = Date.now();
        let isUp = false;
        let lastError = '';
        const redisTimeoutMs = Number(
          this.configService.get<number>('REDIS_HEALTH_TIMEOUT_MS', 2000),
        );
        try {
          const res = await withTimeout(
            this.redisService.getClient().ping(),
            redisTimeoutMs,
            `Redis ping timed out after ${redisTimeoutMs}ms`,
          );
          isUp = res === 'PONG';
          if (!isUp) {
            lastError = `Unexpected PING response: ${res}`;
          }
        } catch (err: any) {
          isUp = false;
          lastError = err?.message || 'Redis connection failed';
        }
        const latency = Date.now() - start;
        if (!isUp) {
          throw new HealthCheckError('Redis is down', {
            redis: { status: 'down', latency, error: lastError },
          });
        }
        return { redis: { status: 'up', latency } };
      },
      async () => {
        const start = Date.now();
        if (this.configService.get<boolean>('DEMO_MODE', false)) {
          this.logger.log(
            '[HealthController] DEMO_MODE=true -> Skip MinIO readiness check',
          );
          return {
            minio: { status: 'up', skipped: true, latency: Date.now() - start },
          };
        }

        let isUp = false;
        let lastError = '';
        const endpoint = this.configService.get<string>(
          'MINIO_ENDPOINT',
          'localhost',
        );
        const port = Number(
          this.configService.get<number>('MINIO_PORT', 9000),
        );
        const useSSL = this.configService.get<boolean>(
          'MINIO_USE_SSL',
          false,
        );
        const protocol = useSSL ? 'https' : 'http';
        const portSuffix =
          (port === 80 && !useSSL) || (port === 443 && useSSL)
            ? ''
            : `:${port}`;
        const minioHealthUrl = `${protocol}://${endpoint}${portSuffix}/minio/health/live`;

        const controller = new AbortController();
        const timeoutMs = Number(
          this.configService.get<number>('MINIO_HEALTH_TIMEOUT_MS', 3000),
        );
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(minioHealthUrl, {
            signal: controller.signal,
          });
          if (res.status === 200) {
            isUp = true;
          } else {
            lastError = `MinIO health endpoint returned HTTP status ${res.status}`;
          }
        } catch (err: any) {
          lastError = err?.message || 'MinIO connection timeout or failure';
        } finally {
          clearTimeout(timeoutId);
        }

        const latency = Date.now() - start;
        if (!isUp) {
          throw new HealthCheckError('MinIO is down', {
            minio: { status: 'down', latency, error: lastError },
          });
        }
        return { minio: { status: 'up', latency } };
      },
      async () => {
        const start = Date.now();
        let isUp = false;
        let lastError = '';
        let q: Queue | null = null;
        const bullmqTimeoutMs = Number(
          this.configService.get<number>('BULLMQ_HEALTH_TIMEOUT_MS', 2000),
        );
        try {
          q = new Queue(BLOCKCHAIN_QUEUE_NAME, {
            connection: createBlockchainQueueConnection(this.configService),
          });
          q.on('error', () => {});
          const client = await withTimeout(
            q.client,
            bullmqTimeoutMs,
            `BullMQ client initialization timed out after ${bullmqTimeoutMs}ms`,
          );
          isUp = client.status === 'ready';
          if (!isUp) {
            lastError = `Queue client status is '${client.status}', expected 'ready'`;
          }
        } catch (err: any) {
          isUp = false;
          lastError = err?.message || 'Connection to BullMQ queue failed';
        } finally {
          if (q) {
            await withTimeout(q.close(), 1000, 'BullMQ close timed out').catch(
              () => {},
            );
          }
        }
        const latency = Date.now() - start;
        if (!isUp) {
          throw new HealthCheckError('BullMQ is down', {
            bullmq: { status: 'down', latency, error: lastError },
          });
        }
        return { bullmq: { status: 'up', latency } };
      },
    ]);
  }

  @Get()
  @HealthCheck()
  check() {
    return this.checkReady();
  }
}
