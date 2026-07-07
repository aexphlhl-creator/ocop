import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { RedisService } from '../redis/redis.service';
import { RoleName, ProductStatus } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: jest.Mocked<Partial<ProductsRepository>>;
  let redisService: jest.Mocked<Partial<RedisService>>;

  const mockAdminUser = {
    id: 'admin-uuid',
    email: 'admin@ocop.gov.vn',
    fullName: 'Admin',
    phone: '0123',
    role: RoleName.ADMIN,
    isActive: true,
    createdAt: new Date(),
  };

  const mockProduct = {
    id: 'product-uuid',
    name: 'Bột cacao Cầu Đất',
    slug: 'bot-cacao-cau-dat',
    description: 'Bột cacao hữu cơ...',
    price: 120000,
    unit: 'Hộp',
    status: ProductStatus.PENDING,
    business: {
      id: 'business-uuid',
      name: 'Business',
      userId: 'seller-uuid',
    },
  };

  beforeEach(async () => {
    repository = {
      findAndCount: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      approveProduct: jest.fn(),
      softDelete: jest.fn(),
      checkBusinessOwnership: jest.fn(),
    };

    const redisClientMock = {
      keys: jest.fn().mockResolvedValue(['products:list:1']),
      del: jest.fn().mockResolvedValue(1),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue(redisClientMock),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: repository },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('approve', () => {
    it('should approve successfully and clear cache', async () => {
      repository.findById.mockResolvedValue(mockProduct as any);
      repository.approveProduct.mockResolvedValue({ ...mockProduct, status: ProductStatus.APPROVED } as any);

      const result = await service.approve('product-uuid', { status: ProductStatus.APPROVED }, mockAdminUser);

      expect(result.status).toBe(ProductStatus.APPROVED);
      expect(repository.approveProduct).toHaveBeenCalled();
      expect(redisService.getClient().keys).toHaveBeenCalled();
      expect(redisService.getClient().del).toHaveBeenCalled();
    });

    it('should throw BadRequestException if reject reason is missing', async () => {
      repository.findById.mockResolvedValue(mockProduct as any);

      await expect(
        service.approve('product-uuid', { status: ProductStatus.REJECTED }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject successfully when reason is provided', async () => {
      repository.findById.mockResolvedValue(mockProduct as any);
      repository.approveProduct.mockResolvedValue({ ...mockProduct, status: ProductStatus.REJECTED, rejectReason: 'reason' } as any);

      const result = await service.approve(
        'product-uuid',
        { status: ProductStatus.REJECTED, reason: 'reason' },
        mockAdminUser,
      );

      expect(result.status).toBe(ProductStatus.REJECTED);
    });
  });
});
