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
import { NotificationsService } from '../notifications/notifications.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Injectable()
export class ProductsService {
  private readonly CACHE_TTL = 300; // 5 phút (300 giây)

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly blockchainService: BlockchainService,
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
      originProcess: dto.originProcess || null,
      farmingProcess: dto.farmingProcess || null,
      harvestProcess: dto.harvestProcess || null,
      packagingProcess: dto.packagingProcess || null,
      certificateNumber: dto.certificateNumber || null,
      harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : null,
      status,
      category: { connect: { id: dto.categoryId } },
      ocopLevel: { connect: { id: dto.ocopLevelId } },
      business: { connect: { id: dto.businessId } },
      province: { connect: { id: dto.provinceId } },
      ward: { connect: { id: dto.wardId } },
    };

    const imageUrls = dto.imageUrls?.slice(0, 10) || [];

    const product = await this.productsRepository.create(productInput, imageUrls);
    await this.clearProductListCache();
    
    // Ghi Blockchain cho Sản phẩm mới (nếu có truy xuất nguồn gốc)
    const p = product as any;
    if (p.originProcess || p.farmingProcess || p.harvestProcess || p.packagingProcess || p.certificateNumber) {
      await this.blockchainService.createBlock(product.id, 'PRODUCT_CREATED', {
        originProcess: p.originProcess,
        farmingProcess: p.farmingProcess,
        harvestProcess: p.harvestProcess,
        packagingProcess: p.packagingProcess,
        certificateNumber: p.certificateNumber,
        harvestDate: p.harvestDate,
      });
    }
    
    // Gửi thông báo
    if (currentUser.role === RoleName.SELLER && product.business) {
      await this.notificationsService.notifyAdminsNewProduct(product.name, product.business.name, product.id);
    }
    
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

  async findOne(id: string, currentUser?: RequestUser | null) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }

    if (product.status !== ProductStatus.APPROVED) {
      if (!currentUser) {
        throw new ForbiddenException('Bạn không có quyền xem sản phẩm này');
      }
      if (currentUser.role === RoleName.SELLER && product.business?.userId !== currentUser.id) {
        throw new ForbiddenException('Bạn không có quyền xem sản phẩm này');
      }
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
      originProcess: dto.originProcess !== undefined ? dto.originProcess : undefined,
      farmingProcess: dto.farmingProcess !== undefined ? dto.farmingProcess : undefined,
      harvestProcess: dto.harvestProcess !== undefined ? dto.harvestProcess : undefined,
      packagingProcess: dto.packagingProcess !== undefined ? dto.packagingProcess : undefined,
      certificateNumber: dto.certificateNumber !== undefined ? dto.certificateNumber : undefined,
      harvestDate: dto.harvestDate !== undefined ? (dto.harvestDate ? new Date(dto.harvestDate) : null) : undefined,
      status,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      ocopLevel: dto.ocopLevelId ? { connect: { id: dto.ocopLevelId } } : undefined,
      business: dto.businessId ? { connect: { id: dto.businessId } } : undefined,
      province: dto.provinceId ? { connect: { id: dto.provinceId } } : undefined,
      ward: dto.wardId ? { connect: { id: dto.wardId } } : undefined,
    };

    const imageUrls = dto.imageUrls?.slice(0, 10) || [];

    const product = await this.productsRepository.update(id, updateInputData, imageUrls);
    await this.clearProductListCache();

    // Ghi Blockchain khi cập nhật dữ liệu truy xuất nguồn gốc
    const ex = existing as any;
    const hasTraceabilityChanges = 
      (dto.originProcess !== undefined && dto.originProcess !== ex.originProcess) ||
      (dto.farmingProcess !== undefined && dto.farmingProcess !== ex.farmingProcess) ||
      (dto.harvestProcess !== undefined && dto.harvestProcess !== ex.harvestProcess) ||
      (dto.packagingProcess !== undefined && dto.packagingProcess !== ex.packagingProcess) ||
      (dto.certificateNumber !== undefined && dto.certificateNumber !== ex.certificateNumber) ||
      (dto.harvestDate !== undefined);

    if (hasTraceabilityChanges) {
      const up = product as any;
      await this.blockchainService.createBlock(product.id, 'TRACEABILITY_UPDATED', {
        originProcess: up.originProcess,
        farmingProcess: up.farmingProcess,
        harvestProcess: up.harvestProcess,
        packagingProcess: up.packagingProcess,
        certificateNumber: up.certificateNumber,
        harvestDate: up.harvestDate,
      });
    }

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

    // Gửi thông báo cho Seller
    if (existing.business && existing.business.userId) {
      const isApproved = dto.status === ProductStatus.APPROVED;
      if (dto.status !== ProductStatus.PENDING) {
        await this.notificationsService.notifySellerProductStatus(
          existing.business.userId,
          existing.name,
          isApproved,
          dto.reason,
        );
      }
    }

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
  async incrementViewCount(id: string) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }
    await this.productsRepository.incrementViewCount(id);
    return { success: true };
  }
}
