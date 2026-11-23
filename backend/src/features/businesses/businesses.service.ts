import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { BusinessesRepository } from './businesses.repository';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { GetBusinessesQueryDto } from './dto/get-businesses-query.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RedisService } from '../redis/redis.service';
import { Prisma, RoleName } from '@prisma/client';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

type SellerProfileResponseInput = Awaited<
  ReturnType<BusinessesRepository['create']>
> & {
  seller: Partial<
    NonNullable<Awaited<ReturnType<BusinessesRepository['findById']>>>['seller']
  >;
};

@Injectable()
export class BusinessesService {
  private readonly CACHE_TTL = 600; // 10 phút

  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateBusinessDto, currentUser: RequestUser) {
    // SellerProfile là một-một với tài khoản SELLER.
    const existingTaxCode = await this.businessesRepository.findByTaxCode(
      dto.taxCode,
    );
    if (existingTaxCode) {
      throw new ConflictException('Mã số thuế đã tồn tại trên hệ thống');
    }

    // 2. Xác định chủ sở hữu (Owner)
    const targetUserId =
      currentUser.role === RoleName.ADMIN && dto.ownerId
        ? dto.ownerId
        : currentUser.id;

    const seller = await this.businessesRepository.isSeller(targetUserId);
    if (!seller) {
      throw new ForbiddenException(
        'Chỉ tài khoản SELLER mới có hồ sơ người bán',
      );
    }
    if (await this.businessesRepository.findByUserId(targetUserId)) {
      throw new ConflictException('Tài khoản SELLER này đã có hồ sơ người bán');
    }

    const createInput = {
      displayName: dto.name,
      taxCode: dto.taxCode,
      phone: dto.phone || null,
      email: dto.email || null,
      address: dto.address,
      description: dto.description || null,
      industry: dto.industry || null,
      avatarUrl: dto.avatarUrl || null,
      seller: { connect: { id: targetUserId } },
      province: { connect: { id: dto.provinceId } },
      ward: { connect: { id: dto.wardId } },
      isVerified: false, // Mặc định tạo mới chưa được xác thực
    };

    const business = await this.businessesRepository.create(createInput);
    await this.clearBusinessListCache();
    return this.mapBusinessToResponse(business);
  }

  async findAll(query: GetBusinessesQueryDto, currentUser?: RequestUser) {
    const { page, limit, search, provinceId, wardId, verified, ownerId } =
      query;
    const includeInactive =
      currentUser?.role === RoleName.ADMIN && query.includeInactive === true;

    const cacheKey = `seller-profiles:list:s_${search || ''}:p_${provinceId || 'all'}:w_${wardId || 'all'}:v_${verified !== undefined ? verified : 'all'}:o_${ownerId || 'all'}:inactive_${includeInactive}:pg_${page}:lim_${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ReturnType<
        typeof createPaginationResponse<
          ReturnType<BusinessesService['mapBusinessToResponse']>
        >
      >;
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const { items, total } = await this.businessesRepository.findAndCount({
      skip,
      take,
      search,
      provinceId,
      wardId,
      verified,
      ownerId,
      includeInactive,
    });

    const mappedItems = items.map((b) => this.mapBusinessToResponse(b));
    const response = createPaginationResponse(mappedItems, total, page, limit);

    await this.redisService.set(
      cacheKey,
      JSON.stringify(response),
      this.CACHE_TTL,
    );
    return response;
  }

  async findOne(id: string, currentUser?: RequestUser) {
    const business = await this.businessesRepository.findById(id);
    if (
      !business ||
      (!business.seller.isActive && currentUser?.role !== RoleName.ADMIN)
    ) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ người bán với ID "${id}"`,
      );
    }
    return this.mapBusinessToResponse(business);
  }

  async update(id: string, dto: UpdateBusinessDto, currentUser: RequestUser) {
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ người bán với ID "${id}"`,
      );
    }

    // 1. Phân quyền
    if (currentUser.role === RoleName.SELLER) {
      if (existing.seller.id !== currentUser.id) {
        throw new ForbiddenException(
          'Bạn không sở hữu hồ sơ người bán này nên không thể sửa đổi',
        );
      }
    }

    // 2. Kiểm tra trùng mã số thuế mới
    if (dto.taxCode && dto.taxCode !== existing.taxCode) {
      const existingTaxCode = await this.businessesRepository.findByTaxCode(
        dto.taxCode,
      );
      if (existingTaxCode && existingTaxCode.id !== id) {
        throw new ConflictException(
          'Mã số thuế đã được sử dụng bởi chủ thể khác',
        );
      }
    }

    const updateData: Prisma.SellerProfileUpdateInput = {
      displayName: dto.name,
      taxCode: dto.taxCode,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      description: dto.description,
      industry: dto.industry,
      avatarUrl: dto.avatarUrl,
      province: dto.provinceId
        ? { connect: { id: dto.provinceId } }
        : undefined,
      ward: dto.wardId ? { connect: { id: dto.wardId } } : undefined,
    };

    // Chỉ Admin mới cập nhật được trạng thái xác thực và đổi người sở hữu
    if (currentUser.role === RoleName.ADMIN) {
      if (dto.isVerified !== undefined) {
        updateData.isVerified = dto.isVerified;
      }
      if (dto.ownerId) {
        const targetSeller = await this.businessesRepository.isSeller(
          dto.ownerId,
        );
        if (!targetSeller) {
          throw new ForbiddenException(
            'Người được chọn không phải tài khoản SELLER',
          );
        }
        const targetProfile = await this.businessesRepository.findByUserId(
          dto.ownerId,
        );
        if (targetProfile && targetProfile.id !== id) {
          throw new ConflictException('Tài khoản SELLER đích đã có hồ sơ');
        }
        updateData.seller = { connect: { id: dto.ownerId } };
      }
    } else if (currentUser.role === RoleName.SELLER) {
      // Khi chủ thể tự sửa thông tin, tự động đưa về trạng thái chờ duyệt
      updateData.isVerified = false;
    }

    const updated = await this.businessesRepository.update(id, updateData);
    await this.clearBusinessListCache();
    return this.mapBusinessToResponse(updated);
  }

  async remove(id: string, currentUser: RequestUser) {
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ người bán với ID "${id}"`,
      );
    }

    if (currentUser.role === RoleName.SELLER) {
      if (existing.seller.id !== currentUser.id) {
        throw new ForbiddenException(
          'Bạn không sở hữu hồ sơ người bán này nên không thể vô hiệu hóa',
        );
      }
    }

    await this.businessesRepository.deactivateSeller(id);
    await this.clearBusinessListCache();
    return { id, message: 'Đã vô hiệu hóa tài khoản người bán' };
  }

  private async clearBusinessListCache() {
    await this.redisService.deleteByPatterns([
      'seller-profiles:list:*',
      'products:list:*',
      'dashboard:*',
      'statistics:*',
    ]);
  }

  private mapBusinessToResponse(business: SellerProfileResponseInput) {
    return {
      id: business.id,
      name: business.displayName,
      displayName: business.displayName,
      sellerId: business.sellerId,
      taxCode: business.taxCode,
      address: business.address,
      description: business.description,
      industry: business.industry,
      avatarUrl: business.avatarUrl,
      phone: business.phone,
      email: business.email,
      province: business.province
        ? {
            id: business.province.id,
            name: business.province.name,
            code: business.province.code,
          }
        : null,
      ward: business.ward
        ? {
            id: business.ward.id,
            name: business.ward.name,
          }
        : null,
      owner: business.seller
        ? {
            id: business.seller.id,
            fullName: business.seller.fullName,
            email: business.seller.email,
            phone: business.seller.phone,
            isActive: business.seller.isActive,
          }
        : null,
      isVerified: business.isVerified,
      productsCount: business.seller?._count?.sellerProducts ?? 0,
      featuredProducts: (business.seller?.sellerProducts || []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        image: p.images?.[0]?.imageUrl || null,
        ocopLevel: p.ocopLevel?.level || 3,
        ocopTitle: p.ocopLevel?.title || '3 Sao',
      })),
      createdAt: business.createdAt,
    };
  }
}
