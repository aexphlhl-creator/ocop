import { Test, TestingModule } from '@nestjs/testing';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';
import { RedisService } from '../redis/redis.service';
import { RoleName } from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('BusinessesService', () => {
  let service: BusinessesService;
  let repository: jest.Mocked<
    Pick<
      BusinessesRepository,
      | 'findByTaxCode'
      | 'create'
      | 'findById'
      | 'update'
      | 'findAndCount'
      | 'isSeller'
      | 'findByUserId'
      | 'deactivateSeller'
    >
  >;
  let redisService: jest.Mocked<
    Pick<RedisService, 'get' | 'set' | 'deleteByPatterns'>
  >;

  const mockUser = {
    id: 'owner-uuid',
    email: 'seller@example.com',
    fullName: 'Seller Name',
    phone: '0987654321',
    role: RoleName.SELLER,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
  };

  const mockBusiness: NonNullable<
    Awaited<ReturnType<BusinessesRepository['findById']>>
  > = {
    id: 'profile-uuid',
    sellerId: 'owner-uuid',
    displayName: 'Gian hàng Bát Tràng',
    taxCode: '0101234567',
    address: 'Bát Tràng, Hà Nội',
    phone: '0243',
    email: 'contact@battrang.vn',
    isVerified: false,
    seller: { ...mockUser, sellerProducts: [], _count: { sellerProducts: 0 } },
    province: null,
    ward: null,
    provinceId: null,
    wardId: null,
    avatarUrl: null,
    description: null,
    industry: null,
    legacyBusinessId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    repository = {
      findByTaxCode: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      findAndCount: jest.fn(),
      isSeller: jest.fn().mockResolvedValue(mockUser),
      findByUserId: jest.fn().mockResolvedValue(null),
      deactivateSeller: jest.fn(),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      deleteByPatterns: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: BusinessesRepository, useValue: repository },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<BusinessesService>(BusinessesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create business successfully and invalidate cache', async () => {
      repository.findByTaxCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockBusiness);

      const result = await service.create(
        {
          name: 'HTX Bát Tràng',
          taxCode: '0101234567',
          address: 'Bát Tràng, Hà Nội',
          provinceId: 'prov-uuid',
          wardId: 'ward-uuid',
        },
        mockUser,
      );

      expect(result.taxCode).toBe('0101234567');
      expect(repository.create).toHaveBeenCalled();
      expect(redisService.deleteByPatterns).toHaveBeenCalledWith(
        expect.arrayContaining(['seller-profiles:list:*', 'products:list:*']),
      );
    });

    it('should throw ConflictException if tax code is duplicate', async () => {
      repository.findByTaxCode.mockResolvedValue(mockBusiness);

      await expect(
        service.create(
          {
            name: 'HTX Bát Tràng',
            taxCode: '0101234567',
            address: 'Bát Tràng, Hà Nội',
            provinceId: 'prov-uuid',
            wardId: 'ward-uuid',
          },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update successfully when seller is owner', async () => {
      repository.findById.mockResolvedValue(mockBusiness);
      repository.update.mockResolvedValue({
        ...mockBusiness,
        displayName: 'Gian hàng Bát Tràng mới',
      });

      const result = await service.update(
        'profile-uuid',
        { name: 'Gian hàng Bát Tràng mới' },
        mockUser,
      );

      expect(result.name).toBe('Gian hàng Bát Tràng mới');
    });

    it('should throw ForbiddenException if seller is not owner', async () => {
      repository.findById.mockResolvedValue({
        ...mockBusiness,
        seller: { ...mockBusiness.seller, id: 'other-owner-uuid' },
      });

      await expect(
        service.update('profile-uuid', { name: 'HTX Bát Tràng New' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
