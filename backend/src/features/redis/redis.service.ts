import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private isConnected = false;
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');
    const host = configService.get<string>('REDIS_HOST', 'localhost');
    const port = configService.get<number>('REDIS_PORT', 6379);
    const password = configService.get<string>('REDIS_PASSWORD', '');

    if (redisUrl) {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 500, 2000);
        },
        enableOfflineQueue: false,
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      });
    } else {
      this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      // Không retry liên tục khi không có Redis
      retryStrategy: (times) => {
        if (times > 3) return null; // Dừng retry sau 3 lần
        return Math.min(times * 500, 2000);
      },
      enableOfflineQueue: false,
      });
    }

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Redis connected successfully');
    });

    this.client.on('error', () => {
      this.isConnected = false;
      // Không log lỗi liên tục để tránh spam console
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch {
      this.logger.warn('Redis không khả dụng – cache bị bỏ qua, hệ thống vẫn hoạt động bình thường');
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // ignore
    }
  }

  getClient(): Redis {
    return this.client;
  }

  /** Trả về null khi Redis không khả dụng thay vì throw */
  async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  /** Bỏ qua silently khi Redis không khả dụng */
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
}
