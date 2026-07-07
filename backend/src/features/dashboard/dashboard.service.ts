import { Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DashboardService {
  private readonly CACHE_TTL = 300; // 5 phút

  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly redisService: RedisService,
  ) {}

  async getCounts() {
    const cacheKey = 'dashboard:admin';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const counts = await this.dashboardRepository.getCounts();
    await this.redisService.set(cacheKey, JSON.stringify(counts), this.CACHE_TTL);
    return counts;
  }
}
