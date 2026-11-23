import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { RedisService } from '../redis/redis.service';
import { RoleName, ProductStatus, Prisma } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { BlockchainService } from '../blockchain/blockchain.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: jest.Mocked<
    Pick<
      ProductsRepository,
      | 'findAndCount'
      | 'findById'
      | 'findBySlug'
      | 'create'
      | 'update'
      | 'approveProduct'
      | 'softDelete'
      | 'calculateAvailableStock'
      | 'calculateBatchAvailableStock'
    >
  >;
  let redisService: jest.Mocked<
    Pick<RedisService, 'get' | 'set' | 'getClient'>
  >;
  const redisClientMock = {
    keys: jest.fn().mockResolvedValue(['products:list:1']),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockAdminUser = {
    id: 'admin-uuid',
    email: 'admin@ocop.gov.vn',
    fullName: 'Admin',
    phone: '0123',
    role: RoleName.ADMIN,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
  };

  const mockProduct: NonNullable<
    Awaited<ReturnType<ProductsRepository['findById']>>
  > = {
    id: 'product-uuid',
    name: 'Bột cacao Cầu Đất',
    slug: 'bot-cacao-cau-dat',
    description: 'Bột cacao hữu cơ...',
    price: new Prisma.Decimal(120000),
    unit: 'Hộp',
    status: ProductStatus.PENDING,
    sellerId: 'seller-uuid',
    seller: {
      id: 'seller-uuid',
      isActive: true,
      fullName: 'Seller',
      email: 'seller@example.test',
      phone: null,
      sellerProfile: null,
    },
    businessId: null,
    categoryId: 'category-uuid',
    category: {
      id: 'category-uuid',
      name: 'Food',
      slug: 'food',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ocopLevelId: 'level-uuid',
    ocopLevel: {
      id: 'level-uuid',
      level: 3,
      title: '3 sao',
      icon: null,
      color: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    provinceId: 'province-uuid',
    province: { id: 'province-uuid', name: 'Lâm Đồng' },
    wardId: 'ward-uuid',
    ward: { id: 'ward-uuid', name: 'Cầu Đất' },
    latitude: 11.9,
    longitude: 108.4,
    images: [],
    approvedAt: null,
    approvedById: null,
    rejectReason: null,
    videoUrl: null,
    averageRating: 0,
    reviewCount: 0,
    originProcess: null,
    farmingProcess: null,
    harvestProcess: null,
    packagingProcess: null,
    certificateNumber: null,
    harvestDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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
      calculateAvailableStock: jest.fn().mockResolvedValue(10),
      calculateBatchAvailableStock: jest.fn().mockResolvedValue(new Map()),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue(redisClientMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: repository },
        { provide: RedisService, useValue: redisService },
        {
          provide: NotificationsService,
          useValue: { notifySellerProductStatus: jest.fn() },
        },
        { provide: BlockchainService, useValue: { createBlock: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('hides products owned by a locked Seller from public callers', async () => {
      repository.findById.mockResolvedValue({
        ...mockProduct,
        status: ProductStatus.APPROVED,
        seller: { ...mockProduct.seller, isActive: false },
      });

      await expect(service.findOne('product-uuid', null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows Admin to inspect a product owned by a locked Seller', async () => {
      const lockedProduct = {
        ...mockProduct,
        status: ProductStatus.APPROVED,
        seller: { ...mockProduct.seller, isActive: false },
      };
      repository.findById.mockResolvedValue(lockedProduct);

      await expect(
        service.findOne('product-uuid', mockAdminUser),
      ).resolves.toEqual({ ...lockedProduct, availableStock: 10 });
    });

    it('passes slug to repository when slug is requested', async () => {
      const approvedProduct = {
        ...mockProduct,
        status: ProductStatus.APPROVED,
      };
      repository.findById.mockResolvedValue(approvedProduct);

      const result = await service.findOne('binh-tra-gom-su-bat-trang', null);

      expect(repository.findById).toHaveBeenCalledWith(
        'binh-tra-gom-su-bat-trang',
      );
      expect(result).toEqual({ ...approvedProduct, availableStock: 10 });
    });
  });

  describe('approve', () => {
    it('should approve successfully and clear cache', async () => {
      repository.findById.mockResolvedValue(mockProduct);
      repository.approveProduct.mockResolvedValue({
        ...mockProduct,
        status: ProductStatus.APPROVED,
      });

      const result = await service.approve(
        'product-uuid',
        { status: ProductStatus.APPROVED },
        mockAdminUser,
      );

      expect(result.status).toBe(ProductStatus.APPROVED);
      expect(repository.approveProduct).toHaveBeenCalled();
      expect(redisClientMock.keys).toHaveBeenCalled();
      expect(redisClientMock.del).toHaveBeenCalled();
    });

    it('should throw BadRequestException if reject reason is missing', async () => {
      repository.findById.mockResolvedValue(mockProduct);

      await expect(
        service.approve(
          'product-uuid',
          { status: ProductStatus.REJECTED },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject successfully when reason is provided', async () => {
      repository.findById.mockResolvedValue(mockProduct);
      repository.approveProduct.mockResolvedValue({
        ...mockProduct,
        status: ProductStatus.REJECTED,
        rejectReason: 'reason',
      });

      const result = await service.approve(
        'product-uuid',
        { status: ProductStatus.REJECTED, reason: 'reason' },
        mockAdminUser,
      );

      expect(result.status).toBe(ProductStatus.REJECTED);
    });
  });
});
