import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { RedisService } from '../redis/redis.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let repository: jest.Mocked<Partial<DashboardRepository>>;
  let redisService: jest.Mocked<Partial<RedisService>>;

  const mockCounts = {
    users: 10,
    businesses: 5,
    products: 15,
    approvedProducts: 10,
    pendingProducts: 3,
    rejectedProducts: 2,
    provinces: 34,
    wards: 100,
    categories: 6,
    news: 12,
  };

  beforeEach(async () => {
    repository = {
      getCounts: jest.fn().mockResolvedValue(mockCounts),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: repository },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCounts', () => {
    it('should hit cache if exists', async () => {
      jest
        .spyOn(redisService, 'get')
        .mockResolvedValue(JSON.stringify(mockCounts));

      const result = await service.getCounts();

      expect(result.users).toBe(10);
      expect(repository.getCounts).not.toHaveBeenCalled();
    });

    it('should fetch and cache if cache misses', async () => {
      const result = await service.getCounts();

      expect(result.users).toBe(10);
      expect(repository.getCounts).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });
  });
});
