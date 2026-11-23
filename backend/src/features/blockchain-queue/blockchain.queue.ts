import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions, JobsOptions } from 'bullmq';
import { createRedisConnectionOptions } from '../redis/redis-connection.util';

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

export function createBlockchainQueueConnection(
  configService: ConfigService,
): ConnectionOptions {
  return createRedisConnectionOptions(configService);
}
