import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProductStatus, RoleName } from '@prisma/client';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAndCount(params: {
    skip: number;
    take: number;
    search?: string;
    categoryId?: string;
    provinceId?: string;
    wardId?: string;
    businessId?: string;
    ocopLevelId?: string;
    status?: ProductStatus;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    userContext?: { id: string; role: RoleName } | null;
  }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    // 1. Tìm kiếm theo từ khóa (name hoặc description)
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    // 2. Bộ lọc khóa ngoại
    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }
    if (params.provinceId) {
      where.provinceId = params.provinceId;
    }
    if (params.wardId) {
      where.wardId = params.wardId;
    }
    if (params.businessId) {
      where.businessId = params.businessId;
    }
    if (params.ocopLevelId) {
      where.ocopLevelId = params.ocopLevelId;
    }

    // 3. Bộ lọc khoảng giá
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.price = {};
      if (params.minPrice !== undefined) {
        where.price.gte = params.minPrice;
      }
      if (params.maxPrice !== undefined) {
        where.price.lte = params.maxPrice;
      }
    }

    // 4. Quyền hiển thị của các vai trò (Visibility / RBAC)
    const role = params.userContext?.role;
    const userId = params.userContext?.id;

    if (!role || role === RoleName.VISITOR) {
      // Visitor chỉ nhìn thấy APPROVED
      where.status = ProductStatus.APPROVED;
    } else if (role === RoleName.SELLER) {
      // Seller xem được APPROVED toàn hệ thống, hoặc PENDING/REJECTED của chính mình
      const statusFilter = params.status;
      if (statusFilter) {
        if (statusFilter === ProductStatus.APPROVED) {
          where.status = ProductStatus.APPROVED;
        } else {
          where.status = statusFilter;
          where.business = { userId };
        }
      } else {
        where.OR = [
          ...(where.OR || []),
          { status: ProductStatus.APPROVED },
          { business: { userId } },
        ];
      }
    } else if (role === RoleName.ADMIN) {
      // Admin xem được tất cả trạng thái
      if (params.status) {
        where.status = params.status;
      }
    }

    // 5. Cấu hình sắp xếp
    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';
    const orderBy: Prisma.ProductOrderByWithRelationInput = {};

    if (sortBy === 'price') {
      orderBy.price = sortOrder;
    } else if (sortBy === 'name') {
      orderBy.name = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy,
        include: {
          category: true,
          ocopLevel: true,
          business: {
            select: {
              id: true,
              name: true,
              userId: true,
              address: true,
              phone: true,
            },
          },
          province: {
            select: {
              id: true,
              name: true,
            },
          },
          ward: {
            select: {
              id: true,
              name: true,
            },
          },
          images: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findSellerProductsAndCount(params: {
    sellerId: string;
    skip: number;
    take: number;
  }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      business: {
        userId: params.sellerId,
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          ocopLevel: true,
          business: true,
          province: true,
          ward: true,
          images: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        category: true,
        ocopLevel: true,
        business: {
          select: {
            id: true,
            name: true,
            userId: true,
            address: true,
            phone: true,
          },
        },
        province: {
          select: {
            id: true,
            name: true,
          },
        },
        ward: {
          select: {
            id: true,
            name: true,
          },
        },
        images: true,
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
    });
  }

  async create(data: Prisma.ProductCreateWithoutImagesInput, imageUrls?: string[]) {
    return this.prisma.product.create({
      data: {
        ...data,
        images: imageUrls && imageUrls.length > 0
          ? {
              create: imageUrls.map((url, index) => ({
                imageUrl: url,
                isPrimary: index === 0,
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        ocopLevel: true,
        business: true,
        images: true,
      },
    });
  }

  async update(id: string, data: Prisma.ProductUpdateWithoutImagesInput, imageUrls?: string[]) {
    if (imageUrls) {
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        images: imageUrls && imageUrls.length > 0
          ? {
              create: imageUrls.map((url, index) => ({
                imageUrl: url,
                isPrimary: index === 0,
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        ocopLevel: true,
        business: true,
        images: true,
      },
    });
  }

  async approveProduct(params: {
    productId: string;
    adminId: string;
    oldStatus: ProductStatus;
    newStatus: ProductStatus;
    reason?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: params.productId },
        data: {
          status: params.newStatus,
          approvedAt: params.newStatus === ProductStatus.APPROVED ? new Date() : null,
          approvedById: params.newStatus === ProductStatus.APPROVED ? params.adminId : null,
          rejectReason: params.newStatus === ProductStatus.REJECTED ? params.reason || null : null,
        },
      });

      await tx.productApprovalHistory.create({
        data: {
          productId: params.productId,
          adminId: params.adminId,
          oldStatus: params.oldStatus,
          newStatus: params.newStatus,
          reason: params.reason || null,
        },
      });

      return product;
    });
  }

  async softDelete(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async checkBusinessOwnership(businessId: string, userId: string): Promise<boolean> {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        userId,
      },
    });
    return !!business;
  }

  async incrementViewCount(productId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12

    await this.prisma.productViewStat.upsert({
      where: {
        productId_year_month: {
          productId,
          year,
          month,
        },
      },
      update: {
        viewCount: {
          increment: 1,
        },
      },
      create: {
        productId,
        year,
        month,
        viewCount: 1,
      },
    });
  }
}
