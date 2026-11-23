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
    sellerId?: string;
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
    if (params.sellerId) {
      where.sellerId = params.sellerId;
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
      where.seller = { isActive: true };
    } else if (role === RoleName.SELLER) {
      // Seller xem được APPROVED toàn hệ thống, hoặc PENDING/REJECTED của chính mình
      const statusFilter = params.status;
      if (statusFilter) {
        if (statusFilter === ProductStatus.APPROVED) {
          where.status = ProductStatus.APPROVED;
        } else {
          where.status = statusFilter;
          where.sellerId = userId;
        }
      } else {
        where.OR = [
          ...(where.OR || []),
          { status: ProductStatus.APPROVED },
          { sellerId: userId },
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
          seller: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              sellerProfile: true,
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
      sellerId: params.sellerId,
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
          seller: { include: { sellerProfile: true } },
          province: true,
          ward: true,
          images: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findById(idOrSlug: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    return this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
      },
      include: {
        category: true,
        ocopLevel: true,
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
            sellerProfile: true,
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

  async calculateAvailableStock(
    productId: string,
    sellerId?: string,
  ): Promise<number> {
    const inventories = await this.prisma.inventory.findMany({
      where: {
        productId,
        warehouse: {
          isActive: true,
          ...(sellerId ? { sellerId } : {}),
        },
      },
      select: { id: true },
    });

    const inventoryIds = inventories.map((i) => i.id);
    if (inventoryIds.length === 0) return 0;

    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        inventoryId: { in: inventoryIds },
        status: 'ACTIVE',
        qualityStatus: 'PASSED',
        lifecycleStatus: 'RELEASED',
        quantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
      },
      select: {
        quantity: true,
        orderItemReservations: {
          where: { status: 'ACTIVE' },
          select: { quantity: true },
        },
      },
    });

    let totalAvailable = 0;
    for (const batch of batches) {
      const reserved = batch.orderItemReservations.reduce(
        (sum, r) => sum + r.quantity,
        0,
      );
      totalAvailable += Math.max(0, batch.quantity - reserved);
    }

    return totalAvailable;
  }

  async calculateBatchAvailableStock(
    productIds: string[],
  ): Promise<Map<string, number>> {
    const stockMap = new Map<string, number>();
    for (const id of productIds) stockMap.set(id, 0);
    if (productIds.length === 0) return stockMap;

    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        inventory: {
          productId: { in: productIds },
          warehouse: { isActive: true },
        },
        status: 'ACTIVE',
        qualityStatus: 'PASSED',
        lifecycleStatus: 'RELEASED',
        quantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
      },
      select: {
        quantity: true,
        inventory: {
          select: {
            productId: true,
            warehouse: { select: { sellerId: true } },
          },
        },
        orderItemReservations: {
          where: { status: 'ACTIVE' },
          select: { quantity: true },
        },
      },
    });

    for (const batch of batches) {
      const productId = batch.inventory.productId;
      const reserved = batch.orderItemReservations.reduce(
        (sum, r) => sum + r.quantity,
        0,
      );
      const available = Math.max(0, batch.quantity - reserved);
      stockMap.set(productId, (stockMap.get(productId) ?? 0) + available);
    }

    return stockMap;
  }

  async findBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
    });
  }

  async create(
    data: Prisma.ProductCreateWithoutImagesInput,
    imageUrls?: string[],
  ) {
    return this.prisma.product.create({
      data: {
        ...data,
        images:
          imageUrls && imageUrls.length > 0
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
        seller: { include: { sellerProfile: true } },
        images: true,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.ProductUpdateWithoutImagesInput,
    imageUrls?: string[],
  ) {
    if (imageUrls) {
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        images:
          imageUrls && imageUrls.length > 0
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
        seller: { include: { sellerProfile: true } },
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
          approvedAt:
            params.newStatus === ProductStatus.APPROVED ? new Date() : null,
          approvedById:
            params.newStatus === ProductStatus.APPROVED ? params.adminId : null,
          rejectReason:
            params.newStatus === ProductStatus.REJECTED
              ? params.reason || null
              : null,
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

  async findSellerIdByLegacyBusiness(businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
      },
      select: { userId: true },
    });
    return business?.userId ?? null;
  }

  async isActiveSeller(userId: string): Promise<boolean> {
    const seller = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, role: { name: RoleName.SELLER } },
      select: { id: true },
    });
    return !!seller;
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
