import { Test, TestingModule } from '@nestjs/testing';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';
import { RedisService } from '../redis/redis.service';
import { RoleName } from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('BusinessesService', () => {
  let service: BusinessesService;
  let repository: jest.Mocked<Pick<BusinessesRepository, 'findByTaxCode' | 'create' | 'findById' | 'update' | 'softDelete' | 'findAndCount'>>;
  let redisService: jest.Mocked<Pick<RedisService, 'get' | 'set' | 'getClient'>>;

  const mockUser = {
    id: 'owner-uuid',
    email: 'seller@example.com',
    fullName: 'Seller Name',
    phone: '0987654321',
    role: RoleName.SELLER,
    isActive: true,
    createdAt: new Date(),
  };

  const mockBusiness = {
    id: 'business-uuid',
    name: 'HTX Bát Tràng',
    taxCode: '0101234567',
    address: 'Bát Tràng, Hà Nội',
    phone: '0243',
    email: 'contact@battrang.vn',
    isVerified: false,
    user: { id: 'owner-uuid' },
  };

  beforeEach(async () => {
    repository = {
      findByTaxCode: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findAndCount: jest.fn(),
    };

    const redisClientMock = {
      keys: jest.fn().mockResolvedValue(['businesses:list:1']),
      del: jest.fn().mockResolvedValue(1),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue(redisClientMock),
    } as any;

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
      repository.create.mockResolvedValue(mockBusiness as any);

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
      expect(redisService.getClient().keys).toHaveBeenCalled();
    });

    it('should throw ConflictException if tax code is duplicate', async () => {
      repository.findByTaxCode.mockResolvedValue(mockBusiness as any);

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
      repository.findById.mockResolvedValue(mockBusiness as any);
      repository.update.mockResolvedValue({ ...mockBusiness, name: 'HTX Bát Tràng New' } as any);

      const result = await service.update(
        'business-uuid',
        { name: 'HTX Bát Tràng New' },
        mockUser,
      );

      expect(result.name).toBe('HTX Bát Tràng New');
    });

    it('should throw ForbiddenException if seller is not owner', async () => {
      repository.findById.mockResolvedValue({
        ...mockBusiness,
        user: { id: 'other-owner-uuid' },
      } as any);

      await expect(
        service.update('business-uuid', { name: 'HTX Bát Tràng New' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
