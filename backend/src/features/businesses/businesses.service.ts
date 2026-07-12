import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { BusinessesRepository } from './businesses.repository';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { GetBusinessesQueryDto } from './dto/get-businesses-query.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RedisService } from '../redis/redis.service';
import { RoleName } from '@prisma/client';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

@Injectable()
export class BusinessesService {
  private readonly CACHE_TTL = 600; // 10 phút

  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateBusinessDto, currentUser: RequestUser) {
    // 1. Kiểm tra Trùng mã số thuế
    const existingTaxCode = await this.businessesRepository.findByTaxCode(dto.taxCode);
    if (existingTaxCode) {
      throw new ConflictException('Mã số thuế đã tồn tại trên hệ thống');
    }

    // 2. Xác định chủ sở hữu (Owner)
    const targetUserId = currentUser.role === RoleName.ADMIN && dto.ownerId ? dto.ownerId : currentUser.id;

    const createInput = {
      name: dto.name,
      taxCode: dto.taxCode,
      phone: dto.phone || null,
      email: dto.email || null,
      address: dto.address,
      description: dto.description || null,
      industry: dto.industry || null,
      avatarUrl: dto.avatarUrl || null,
      user: { connect: { id: targetUserId } },
      province: { connect: { id: dto.provinceId } },
      ward: { connect: { id: dto.wardId } },
      isVerified: false, // Mặc định tạo mới chưa được xác thực
    };

    const business = await this.businessesRepository.create(createInput);
    await this.clearBusinessListCache();
    return this.mapBusinessToResponse(business);
  }

  async findAll(query: GetBusinessesQueryDto) {
    const { page, limit, search, provinceId, wardId, verified, ownerId } = query;

    const cacheKey = `businesses:list:s_${search || ''}:p_${provinceId || 'all'}:w_${wardId || 'all'}:v_${verified !== undefined ? verified : 'all'}:o_${ownerId || 'all'}:pg_${page}:lim_${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
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
    });

    const mappedItems = items.map((b) => this.mapBusinessToResponse(b));
    const response = createPaginationResponse(mappedItems, total, page, limit);

    await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    return response;
  }

  async findOne(id: string) {
    const business = await this.businessesRepository.findById(id);
    if (!business) {
      throw new NotFoundException(`Không tìm thấy chủ thể sản xuất với ID "${id}"`);
    }
    return this.mapBusinessToResponse(business);
  }

  async update(id: string, dto: UpdateBusinessDto, currentUser: RequestUser) {
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy chủ thể sản xuất với ID "${id}"`);
    }

    // 1. Phân quyền
    if (currentUser.role === RoleName.SELLER) {
      if (existing.user.id !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu chủ thể sản xuất này nên không thể sửa đổi');
      }
    }

    // 2. Kiểm tra trùng mã số thuế mới
    if (dto.taxCode && dto.taxCode !== existing.taxCode) {
      const existingTaxCode = await this.businessesRepository.findByTaxCode(dto.taxCode);
      if (existingTaxCode && existingTaxCode.id !== id) {
        throw new ConflictException('Mã số thuế đã được sử dụng bởi chủ thể khác');
      }
    }

    const updateData: any = {
      name: dto.name,
      taxCode: dto.taxCode,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      description: dto.description,
      industry: dto.industry,
      avatarUrl: dto.avatarUrl,
      province: dto.provinceId ? { connect: { id: dto.provinceId } } : undefined,
      ward: dto.wardId ? { connect: { id: dto.wardId } } : undefined,
    };

    // Chỉ Admin mới cập nhật được trạng thái xác thực và đổi người sở hữu
    if (currentUser.role === RoleName.ADMIN) {
      if (dto.isVerified !== undefined) {
        updateData.isVerified = dto.isVerified;
      }
      if (dto.ownerId) {
        updateData.user = { connect: { id: dto.ownerId } };
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
      throw new NotFoundException(`Không tìm thấy chủ thể sản xuất với ID "${id}"`);
    }

    if (currentUser.role === RoleName.SELLER) {
      if (existing.user.id !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu chủ thể sản xuất này nên không thể xóa');
      }
    }

    await this.businessesRepository.softDelete(id);
    await this.clearBusinessListCache();
    return { id, message: 'Xóa chủ thể sản xuất thành công' };
  }

  private async clearBusinessListCache() {
    try {
      const client = this.redisService.getClient();
      const keys = await client.keys('businesses:list:*');
      const dashboardKeys = await client.keys('dashboard:*');
      const statsKeys = await client.keys('statistics:*');
      const allKeys = [...keys, ...dashboardKeys, ...statsKeys];
      if (allKeys.length > 0) {
        await client.del(...allKeys);
      }
    } catch {
      // Bỏ qua lỗi Redis
    }
  }

  private mapBusinessToResponse(business: any) {
    return {
      id: business.id,
      name: business.name,
      taxCode: business.taxCode,
      address: business.address,
      description: business.description,
      industry: business.industry,
      avatarUrl: business.avatarUrl,
      phone: business.phone,
      email: business.email,
      province: business.province ? {
        id: business.province.id,
        name: business.province.name,
        code: business.province.code,
      } : null,
      ward: business.ward ? {
        id: business.ward.id,
        name: business.ward.name,
      } : null,
      owner: business.user ? {
        id: business.user.id,
        fullName: business.user.fullName,
        email: business.user.email,
        phone: business.user.phone,
      } : null,
      isVerified: business.isVerified,
      productsCount: business._count?.products ?? undefined,
      createdAt: business.createdAt,
    };
  }
}
