import { Test, TestingModule } from '@nestjs/testing';
import { NewsService } from './news.service';
import { NewsRepository } from './news.repository';
import { RedisService } from '../redis/redis.service';
import { RoleName, NewsStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('NewsService', () => {
  let service: NewsService;
  let repository: jest.Mocked<
    Pick<
      NewsRepository,
      | 'findBySlug'
      | 'findById'
      | 'create'
      | 'update'
      | 'softDelete'
      | 'findAndCount'
    >
  >;
  let redisService: jest.Mocked<
    Pick<RedisService, 'get' | 'set' | 'getClient'>
  >;

  const mockAdminUser = {
    id: 'admin-uuid',
    email: 'admin@example.com',
    fullName: 'Admin Name',
    phone: '0123',
    role: RoleName.ADMIN,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
  };

  const mockNews = {
    id: 'news-uuid',
    title: 'OCOP 2026',
    slug: 'ocop-2026',
    content: 'Chi tiet...',
    thumbnail: 'thumbnail.png',
    status: NewsStatus.DRAFT,
    author: {
      id: 'admin-uuid',
      email: 'admin@example.com',
      fullName: 'Admin Name',
    },
    authorId: 'admin-uuid',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repository = {
      findBySlug: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findAndCount: jest.fn(),
    };

    const redisClientMock = {
      keys: jest.fn().mockResolvedValue(['news:list:1']),
      del: jest.fn().mockResolvedValue(1),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue(redisClientMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        { provide: NewsRepository, useValue: repository },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<NewsService>(NewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create successfully', async () => {
      repository.findBySlug.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockNews);

      const result = await service.create(
        {
          title: 'OCOP 2026',
          content: 'Chi tiet...',
          thumbnail: 'thumbnail.png',
          status: NewsStatus.PUBLISHED,
        },
        mockAdminUser,
      );

      expect(result.slug).toBe('ocop-2026');
      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe('findOneBySlug', () => {
    it('should throw NotFoundException if draft is requested by visitor', async () => {
      repository.findBySlug.mockResolvedValue(mockNews);

      await expect(service.findOneBySlug('ocop-2026', null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return draft successfully if requested by admin', async () => {
      repository.findBySlug.mockResolvedValue(mockNews);

      const result = await service.findOneBySlug('ocop-2026', mockAdminUser);
      expect(result.id).toBe('news-uuid');
    });
  });
});
