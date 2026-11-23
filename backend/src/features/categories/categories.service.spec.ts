import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;

  const mockCategories = [
    { id: 'cat-1', name: 'Đồ uống', slug: 'do-uong', description: 'Trà, cà phê' },
    { id: 'cat-2', name: 'Thực phẩm', slug: 'thuc-pham', description: 'Nông sản' },
  ];

  const mockPrisma = {
    category: {
      findMany: jest.fn().mockResolvedValue(mockCategories),
      findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
        const found = mockCategories.find((c) => c.id === id);
        return Promise.resolve(found || null);
      }),
    },
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('findAll returns all categories from database and caches them', async () => {
    const result = await service.findAll();
    expect(result).toHaveLength(2);
    expect(mockPrisma.category.findMany).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'categories:list',
      JSON.stringify(mockCategories),
      3600,
    );
  });

  it('findAll returns cached categories if present in Redis', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockCategories));
    const result = await service.findAll();
    expect(result).toHaveLength(2);
    expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
  });

  it('findOne returns category by id', async () => {
    const result = await service.findOne('cat-1');
    expect(result.name).toBe('Đồ uống');
  });

  it('findOne throws NotFoundException when category not found', async () => {
    await expect(service.findOne('cat-non-existent')).rejects.toThrow(NotFoundException);
  });
});
