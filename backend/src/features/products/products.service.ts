import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName, ProductStatus } from '@prisma/client';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  async create(dto: CreateProductDto, currentUser: RequestUser) {
    // 1. Kiểm tra quyền sở hữu doanh nghiệp của Seller
    if (currentUser.role === RoleName.SELLER) {
      const isOwner = await this.productsRepository.checkBusinessOwnership(dto.businessId, currentUser.id);
      if (!isOwner) {
        throw new ForbiddenException('Bạn không có quyền tạo sản phẩm cho chủ thể sản xuất này');
      }
    }

    // 2. Tạo Slug tự động từ tên
    const baseSlug = this.slugify(dto.name);
    let finalSlug = baseSlug;
    const existingProduct = await this.productsRepository.findBySlug(finalSlug);
    if (existingProduct) {
      finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    // 3. Chuẩn hóa trạng thái duyệt sản phẩm (Seller tạo luôn là PENDING)
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

    return this.productsRepository.create(productInput, dto.imageUrls);
  }

  async findAll(query: GetProductsQueryDto) {
    const { page, limit, categoryId, provinceId, ocopLevelId, status } = query;
    const skip = (page - 1) * limit;
    const take = limit;

    const { items, total } = await this.productsRepository.findAndCount({
      skip,
      take,
      categoryId,
      provinceId,
      ocopLevelId,
      status,
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

    // Kiểm tra quyền sở hữu nếu là SELLER
    if (currentUser.role === RoleName.SELLER) {
      if (existing.business.userId !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu sản phẩm này nên không thể sửa đổi');
      }

      // Nếu muốn đổi doanh nghiệp, phải thuộc về chính mình
      if (dto.businessId) {
        const isOwner = await this.productsRepository.checkBusinessOwnership(dto.businessId, currentUser.id);
        if (!isOwner) {
          throw new ForbiddenException('Bạn không có quyền chuyển sản phẩm sang chủ thể sản xuất này');
        }
      }
    }

    // Chuẩn hóa trạng thái: Nếu là Seller sửa sản phẩm, tự động reset về PENDING chờ duyệt lại
    let status = existing.status;
    if (currentUser.role === RoleName.SELLER) {
      status = ProductStatus.PENDING;
    } else if (currentUser.role === RoleName.ADMIN && dto.status) {
      status = dto.status;
    }

    // Tạo slug mới nếu đổi tên
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

    return this.productsRepository.update(id, updateInputData, dto.imageUrls);
  }

  async remove(id: string, currentUser: RequestUser) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Sản phẩm có ID "${id}" không tồn tại hoặc đã bị xóa`);
    }

    // Kiểm tra quyền xóa nếu là SELLER
    if (currentUser.role === RoleName.SELLER) {
      if (existing.business.userId !== currentUser.id) {
        throw new ForbiddenException('Bạn không sở hữu sản phẩm này nên không thể xóa');
      }
    }

    await this.productsRepository.softDelete(id);
    return { id, message: 'Xóa sản phẩm thành công' };
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
