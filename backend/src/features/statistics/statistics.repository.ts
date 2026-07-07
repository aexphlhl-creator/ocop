import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [products, businesses, categories, provinces] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.business.count({ where: { deletedAt: null } }),
      this.prisma.category.count(),
      this.prisma.province.count(),
    ]);

    return { products, businesses, categories, provinces };
  }

  async getProductsByProvince() {
    const provinces = await this.prisma.province.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            products: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return provinces.map((p) => ({
      provinceId: p.id,
      provinceName: p.name,
      count: p._count.products,
    }));
  }

  async getProductsByCategory() {
    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            products: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return categories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      count: c._count.products,
    }));
  }

  async getProductsByOcopLevel() {
    const ocopLevels = await this.prisma.ocopLevel.findMany({
      select: {
        level: true,
        title: true,
        _count: {
          select: {
            products: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        level: 'asc',
      },
    });

    return ocopLevels.map((ol) => ({
      level: ol.level,
      title: ol.title,
      count: ol._count.products,
    }));
  }

  async getBusinessesByProvince() {
    const provinces = await this.prisma.province.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            businesses: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return provinces.map((p) => ({
      provinceId: p.id,
      provinceName: p.name,
      count: p._count.businesses,
    }));
  }

  async getProductsCreatedAt(startDate: Date) {
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
      },
    });
  }
}
