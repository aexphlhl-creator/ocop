import { Test, TestingModule } from '@nestjs/testing';
import { StatisticsService } from './statistics.service';
import { StatisticsRepository } from './statistics.repository';
import { RedisService } from '../redis/redis.service';

describe('StatisticsService', () => {
  let service: StatisticsService;
  let repository: jest.Mocked<Partial<StatisticsRepository>>;
  let redisService: jest.Mocked<Partial<RedisService>>;

  beforeEach(async () => {
    repository = {
      getOverview: jest.fn().mockResolvedValue({ products: 10, businesses: 5, categories: 2, provinces: 34 }),
      getProductsByProvince: jest.fn().mockResolvedValue([{ provinceId: '1', provinceName: 'Lâm Đồng', count: 5 }]),
      getProductsByCategory: jest.fn().mockResolvedValue([{ categoryId: '1', categoryName: 'Đồ uống', count: 3 }]),
      getProductsByOcopLevel: jest.fn().mockResolvedValue([{ level: 3, title: '3 sao', count: 4 }]),
      getBusinessesByProvince: jest.fn().mockResolvedValue([{ provinceId: '1', provinceName: 'Lâm Đồng', count: 2 }]),
      getProductsCreatedAt: jest.fn().mockResolvedValue([]),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: StatisticsRepository, useValue: repository },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverview', () => {
    it('should return from cache if hits', async () => {
      const mockResult = { products: 12, businesses: 6, categories: 3, provinces: 34 };
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(mockResult));

      const result = await service.getOverview();
      expect(result.products).toBe(12);
      expect(repository.getOverview).not.toHaveBeenCalled();
    });

    it('should fetch from repo and cache if misses', async () => {
      const result = await service.getOverview();
      expect(result.products).toBe(10);
      expect(repository.getOverview).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });
  });

  describe('getMonthlyProducts', () => {
    it('should map monthly product creations in the last 12 months correctly', async () => {
      const now = new Date();
      const mockProducts = [
        { createdAt: new Date(now.getFullYear(), now.getMonth(), 5) },
        { createdAt: new Date(now.getFullYear(), now.getMonth(), 10) },
        { createdAt: new Date(now.getFullYear(), now.getMonth() - 1, 15) },
      ];
      repository.getProductsCreatedAt.mockResolvedValue(mockProducts as any);

      const result = await service.getMonthlyProducts();

      expect(result.length).toBe(12);
      // Kiểm tra xem số lượng sản phẩm của tháng hiện tại có bằng 2
      const currentMonth = result[result.length - 1];
      expect(currentMonth.count).toBe(2);

      // Kiểm tra xem số lượng sản phẩm của tháng trước có bằng 1
      const prevMonth = result[result.length - 2];
      expect(prevMonth.count).toBe(1);
    });
  });
});
