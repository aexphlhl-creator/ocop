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

  async getSellerViewsThisMonth(sellerId: string) {
    const cacheKey = `statistics:seller_views:${sellerId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const views = await this.statisticsRepository.getSellerViewsThisMonth(sellerId);
    await this.redisService.set(cacheKey, JSON.stringify(views), 300); // cache 5 mins
    return views;
  }

  // Analytics Dashboard Methods
  
  async getRevenue(days: number = 30, businessId?: string, isSellerUser?: boolean) {
    const cacheKey = `statistics:revenue:${days}:${businessId || 'all'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const orders = await this.statisticsRepository.getRevenueByDay(startDate, endDate, businessId, isSellerUser);
    
    // Tạo mảng danh sách ngày
    const datesMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' }); // e.g. "09/07"
      datesMap.set(dateStr, 0);
    }

    // Cộng dồn doanh thu
    orders.forEach(order => {
      const d = new Date(order.createdAt);
      const dateStr = d.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' });
      if (datesMap.has(dateStr)) {
        datesMap.set(dateStr, datesMap.get(dateStr)! + Number(order.totalAmount));
      }
    });

    const data = Array.from(datesMap.entries()).map(([date, revenue]) => ({
      date,
      revenue
    }));

    await this.redisService.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }

  async getOrdersByStatus(businessId?: string, isSellerUser?: boolean) {
    const cacheKey = `statistics:orders_status:${businessId || 'all'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const statuses = await this.statisticsRepository.getOrdersByStatus(businessId, isSellerUser);
    
    const data = statuses.map(s => ({
      name: s.status,
      value: s._count.id
    }));

    await this.redisService.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }

  async getTopProducts(limit: number = 5, businessId?: string, isSellerUser?: boolean) {
    const cacheKey = `statistics:top_products:${limit}:${businessId || 'all'}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await this.statisticsRepository.getTopProducts(limit, businessId, isSellerUser);
    await this.redisService.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }
}
