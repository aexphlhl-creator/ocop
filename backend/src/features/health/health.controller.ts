import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, PrismaHealthIndicator, HealthCheck } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { BLOCKCHAIN_QUEUE_NAME, createBlockchainQueueConnection } from '../blockchain-queue/blockchain.queue';

@Controller('health')
export class HealthController {
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
      environment: this.configService.get<boolean>('DEMO_MODE', false) ? 'demo' : this.configService.get<string>('NODE_ENV', 'development'),
    };
  }

  @Get('ready')
  @HealthCheck()
  checkReady() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      async () => {
        const start = Date.now();
        let isUp = false;
        try {
          const res = await this.redisService.getClient().ping();
          isUp = res === 'PONG';
        } catch (e) {}
        const latency = Date.now() - start;
        if (!isUp) throw new Error('Redis is down');
        return { redis: { status: 'up', latency } };
      },
      async () => {
        const start = Date.now();
        let isUp = false;
        const endpoint = this.configService.get('MINIO_ENDPOINT');
        try {
          // simple ping to minio health check or root
          await fetch(`http://${endpoint}/minio/health/live`);
          isUp = true;
        } catch (e) {
          // If fetch fails, we might still mark as up if it's an SSL issue or auth, but let's assume /minio/health/live works
        }
        const latency = Date.now() - start;
        return { minio: { status: isUp ? 'up' : 'down', latency } };
      },
      async () => {
        const start = Date.now();
        let isUp = false;
        try {
           // check if BullMQ redis connection is active
           const q = new Queue(BLOCKCHAIN_QUEUE_NAME, { connection: createBlockchainQueueConnection(this.configService) });
           const client = await q.client;
           isUp = client.status === 'ready';
           await q.close();
        } catch(e) {}
        const latency = Date.now() - start;
        return { bullmq: { status: isUp ? 'up' : 'down', latency } };
      }
    ]);
  }

  @Get()
  @HealthCheck()
  check() {
    return this.checkReady();
  }
}
