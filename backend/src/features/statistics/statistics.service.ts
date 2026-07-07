import { Injectable } from '@nestjs/common';
import { StatisticsRepository } from './statistics.repository';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class StatisticsService {
  private readonly CACHE_TTL = 900; // 15 phút

  constructor(
    private readonly statisticsRepository: StatisticsRepository,
    private readonly redisService: RedisService,
  ) {}

  async getOverview() {
    const cacheKey = 'statistics:overview';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.statisticsRepository.getOverview();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getProductsByProvince() {
    const cacheKey = 'statistics:products_by_province';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.statisticsRepository.getProductsByProvince();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getProductsByCategory() {
    const cacheKey = 'statistics:products_by_category';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.statisticsRepository.getProductsByCategory();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getProductsByOcopLevel() {
    const cacheKey = 'statistics:products_by_ocop_level';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.statisticsRepository.getProductsByOcopLevel();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getBusinessesByProvince() {
    const cacheKey = 'statistics:businesses_by_province';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.statisticsRepository.getBusinessesByProvince();
    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }

  async getMonthlyProducts() {
    const cacheKey = 'statistics:monthly_products';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const now = new Date();
    const months: string[] = [];

    // Tạo danh sách 12 tháng gần nhất (YYYY-MM)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    // Thời điểm bắt đầu từ ngày đầu tiên của tháng thứ 12 trước đó
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
    const products = await this.statisticsRepository.getProductsCreatedAt(startDate);

    const countsMap = new Map<string, number>();
    months.forEach((m) => countsMap.set(m, 0));

    products.forEach((p) => {
      const pDate = new Date(p.createdAt);
      const year = pDate.getFullYear();
      const month = String(pDate.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      if (countsMap.has(key)) {
        countsMap.set(key, countsMap.get(key)! + 1);
      }
    });

    const data = months.map((m) => ({
      month: m,
      count: countsMap.get(m) || 0,
    }));

    await this.redisService.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
    return data;
  }
}
