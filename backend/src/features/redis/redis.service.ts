import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisConnectionOptions } from './redis-connection.util';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private client: Redis;
  private isConnected = false;
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService) {
    this.client = new Redis({
      ...createRedisConnectionOptions(configService),
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      },
      enableOfflineQueue: false,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      this.logger.warn(`Redis connection error: ${error.message}`);
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch {
      this.logger.warn(
        'Redis is unavailable; cache will be skipped and the application will continue running',
      );
    }
  }

  async onModuleDestroy() {
    try {
      this.client.disconnect();
    } catch {
      // ignore
    }
  }

  async onApplicationShutdown() {
    await this.onModuleDestroy();
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // ignore
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  async deleteByPatterns(patterns: string[]): Promise<void> {
    if (!this.isConnected) return;
    try {
      for (const pattern of patterns) {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          );
          cursor = nextCursor;
          if (keys.length > 0) await this.client.unlink(...keys);
        } while (cursor !== '0');
      }
    } catch {
      // Cache invalidation must never make the primary database operation fail.
    }
  }
}
