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

  async getSellerViewsThisMonth(sellerId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const stats = await this.prisma.productViewStat.aggregate({
      where: {
        year,
        month,
        product: {
          business: {
            userId: sellerId,
          },
          deletedAt: null,
        },
      },
      _sum: {
        viewCount: true,
      },
    });

    return stats._sum.viewCount || 0;
  }

  // Analytics Dashboard Methods
  
  async getRevenueByDay(startDate: Date, endDate: Date, businessId?: string, isSellerUser?: boolean) {
    let actualBusinessId = businessId;
    if (isSellerUser && businessId) {
      const b = await this.prisma.business.findFirst({ where: { userId: businessId } });
      if (b) actualBusinessId = b.id;
      else return []; // Không có cửa hàng
    }

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        businessId: actualBusinessId || undefined,
        status: 'DELIVERED', // Chỉ tính doanh thu khi giao hàng thành công
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
      orderBy: {
        createdAt: 'asc',
      }
    });
    return orders;
  }

  async getOrdersByStatus(businessId?: string, isSellerUser?: boolean) {
    let actualBusinessId = businessId;
    if (isSellerUser && businessId) {
      const b = await this.prisma.business.findFirst({ where: { userId: businessId } });
      if (b) actualBusinessId = b.id;
      else return [];
    }

    const statuses = await this.prisma.order.groupBy({
      by: ['status'],
      where: {
        businessId: actualBusinessId || undefined,
      },
      _count: {
        id: true,
      },
    });
    return statuses;
  }

  async getTopProducts(limit: number, businessId?: string, isSellerUser?: boolean) {
    let actualBusinessId = businessId;
    if (isSellerUser && businessId) {
      const b = await this.prisma.business.findFirst({ where: { userId: businessId } });
      if (b) actualBusinessId = b.id;
      else return [];
    }

    // Lấy danh sách OrderItem đã bán
    const topItems = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          status: 'DELIVERED',
          businessId: actualBusinessId || undefined,
        },
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });

    if (topItems.length === 0) return [];

    // Lấy thông tin chi tiết sản phẩm
    const productIds = topItems.map(item => item.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      select: {
        id: true,
        name: true,
        price: true,
        images: {
          take: 1,
          select: { imageUrl: true }
        }
      }
    });

    // Map kết quả
    return topItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        id: item.productId,
        name: product?.name || 'Sản phẩm đã xóa',
        image: product?.images?.[0]?.imageUrl || null,
        price: product?.price || 0,
        totalSold: item._sum.quantity || 0,
      };
    });
  }
}
