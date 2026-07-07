import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProductStatus } from '@prisma/client';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAndCount(params: {
    skip: number;
    take: number;
    categoryId?: string;
    provinceId?: string;
    ocopLevelId?: string;
    status?: ProductStatus;
  }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }
    if (params.provinceId) {
      where.provinceId = params.provinceId;
    }
    if (params.ocopLevelId) {
      where.ocopLevelId = params.ocopLevelId;
    }
    if (params.status) {
      where.status = params.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          ocopLevel: true,
          business: {
            select: {
              id: true,
              name: true,
              userId: true,
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
}
