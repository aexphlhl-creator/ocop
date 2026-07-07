import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { ApproveProductDto } from './dto/approve-product.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RedisService } from '../redis/redis.service';
import { RoleName, ProductStatus } from '@prisma/client';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

@Injectable()
export class ProductsService {
  private readonly CACHE_TTL = 300; // 5 phút (300 giây)

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateProductDto, currentUser: RequestUser) {
    if (currentUser.role === RoleName.SELLER) {
      const isOwner = await this.productsRepository.checkBusinessOwnership(dto.businessId, currentUser.id);
      if (!isOwner) {
        throw new ForbiddenException('Bạn không có quyền tạo sản phẩm cho chủ thể sản xuất này');
      }
    }

    const baseSlug = this.slugify(dto.name);
    let finalSlug = baseSlug;
    const existingProduct = await this.productsRepository.findBySlug(finalSlug);
    if (existingProduct) {
      finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    const status = currentUser.role === RoleName.ADMIN ? ProductStatus.APPROVED : ProductStatus.PENDING;

    const productInput = {
      name: dto.name,
      slug: finalSlug,
      description: dto.description,
      price: dto.price,
      unit: dto.unit,
      latitude: dto.latitude,
      longitude: dto.longitude,
      videoUrl: dto.videoUrl || null,
      status,
      category: { connect: { id: dto.categoryId } },
      ocopLevel: { connect: { id: dto.ocopLevelId } },
      business: { connect: { id: dto.businessId } },
      province: { connect: { id: dto.provinceId } },
      ward: { connect: { id: dto.wardId } },
    };

    const product = await this.productsRepository.create(productInput, dto.imageUrls);
    await this.clearProductListCache();
    return product;
  }

  async findAll(query: GetProductsQueryDto, userContext?: RequestUser | null) {
    const {
      page,
      limit,
      search,
      categoryId,
      provinceId,
      wardId,
      businessId,
      ocopLevelId,
      status,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder,
    } = query;

    // Thiết lập khóa cache dựa trên các bộ tham số đầu vào và role người dùng để tránh rò rỉ dữ liệu
    const userKey = userContext ? `${userContext.id}_${userContext.role}` : 'visitor';
    const cacheKey = `products:list:u_${userKey}:s_${search || ''}:cat_${categoryId || 'all'}:p_${provinceId || 'all'}:w_${wardId || 'all'}:b_${businessId || 'all'}:lv_${ocopLevelId || 'all'}:st_${status || 'all'}:min_${minPrice || '0'}:max_${maxPrice || 'inf'}:pg_${page}:lim_${limit}:sby_${sortBy}:sod_${sortOrder}`;

    const cachedData = await this.redisService.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const { items, total } = await this.productsRepository.findAndCount({
      skip,
      take,
      search,
      categoryId,
      provinceId,
      wardId,
      businessId,
      ocopLevelId,
      status,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder,
      userContext,
    });

    const response = createPaginationResponse(items, total, page, limit);
    await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    return response;
  }

  async findMyProducts(currentUser: RequestUser, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const take = limit;

    const { items, total } = await this.productsRepository.findSellerProductsAndCount({
      sellerId: currentUser.id,
      skip,
      take,
    });

    return createPaginationResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto, currentUser: RequestUser) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }

    if (currentUser.role === RoleName.SELLER) {
      if (existing.business.userId !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu sản phẩm này nên không thể sửa đổi');
      }

      if (dto.businessId) {
        const isOwner = await this.productsRepository.checkBusinessOwnership(dto.businessId, currentUser.id);
        if (!isOwner) {
          throw new ForbiddenException('Bạn không có quyền chuyển sản phẩm sang chủ thể sản xuất này');
        }
      }
    }

    let status = existing.status;
    if (currentUser.role === RoleName.SELLER) {
      status = ProductStatus.PENDING;
    } else if (currentUser.role === RoleName.ADMIN && dto.status) {
      status = dto.status;
    }

    let finalSlug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      const baseSlug = this.slugify(dto.name);
      finalSlug = baseSlug;
      const existingProduct = await this.productsRepository.findBySlug(finalSlug);
      if (existingProduct && existingProduct.id !== id) {
        finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
      }
    }

    const updateInputData = {
      name: dto.name,
      slug: finalSlug,
      description: dto.description,
      price: dto.price,
      unit: dto.unit,
      latitude: dto.latitude,
      longitude: dto.longitude,
      videoUrl: dto.videoUrl || null,
      status,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      ocopLevel: dto.ocopLevelId ? { connect: { id: dto.ocopLevelId } } : undefined,
      business: dto.businessId ? { connect: { id: dto.businessId } } : undefined,
      province: dto.provinceId ? { connect: { id: dto.provinceId } } : undefined,
      ward: dto.wardId ? { connect: { id: dto.wardId } } : undefined,
    };

    const product = await this.productsRepository.update(id, updateInputData, dto.imageUrls);
    await this.clearProductListCache();
    return product;
  }

  async approve(id: string, dto: ApproveProductDto, currentUser: RequestUser) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }

    // Yêu cầu nhập lý do từ chối nếu chuyển trạng thái sang REJECTED
    if (dto.status === ProductStatus.REJECTED && !dto.reason) {
      throw new BadRequestException('Bắt buộc phải nhập lý do từ chối (reason) khi REJECTED sản phẩm');
    }

    const product = await this.productsRepository.approveProduct({
      productId: id,
      adminId: currentUser.id,
      oldStatus: existing.status,
      newStatus: dto.status,
      reason: dto.reason,
    });

    await this.clearProductListCache();
    return product;
  }

  async remove(id: string, currentUser: RequestUser) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }

    if (currentUser.role === RoleName.SELLER) {
      if (existing.business.userId !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu sản phẩm này nên không thể xóa');
      }
    }

    await this.productsRepository.softDelete(id);
    await this.clearProductListCache();
    return { id, message: 'Xóa sản phẩm thành công' };
  }

  private async clearProductListCache() {
    try {
      const client = this.redisService.getClient();
      const keys = await client.keys('products:list:*');
      const dashboardKeys = await client.keys('dashboard:*');
      const statsKeys = await client.keys('statistics:*');
      const allKeys = [...keys, ...dashboardKeys, ...statsKeys];
      if (allKeys.length > 0) {
        await client.del(...allKeys);
      }
    } catch {
      // Bỏ qua lỗi kết nối Redis khi cố gắng xoá cache
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
