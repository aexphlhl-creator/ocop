import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions, JobsOptions } from 'bullmq';

export const BLOCKCHAIN_QUEUE_NAME = 'blockchain';

export enum BlockchainJobType {
  CERTIFICATE_RECORD = 'CERTIFICATE_RECORD',
  SUPPLY_CHAIN_RECORD = 'SUPPLY_CHAIN_RECORD',
}

export const blockchainJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2_000,
  },
  removeOnComplete: 1000,
  removeOnFail: 500,
};

export function createBlockchainQueueConnection(configService: ConfigService): ConnectionOptions {
  const redisUrl = configService.get<string>('REDIS_URL');
  if (redisUrl) {
    const parsed = new URL(redisUrl);
    const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : configService.get<number>('REDIS_DB', 0);

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: Number.isNaN(db) ? 0 : db,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    } as ConnectionOptions;
  }

  const password = configService.get<string>('REDIS_PASSWORD');

  return {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password: password && password.length > 0 ? password : undefined,
    db: configService.get<number>('REDIS_DB', 0),
    maxRetriesPerRequest: null,
  };
}
