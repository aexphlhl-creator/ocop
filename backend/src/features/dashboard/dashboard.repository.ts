import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus } from '@prisma/client';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCounts() {
    const [
      users,
      businesses,
      products,
      approvedProducts,
      pendingProducts,
      rejectedProducts,
      provinces,
      wards,
      categories,
      news,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.business.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.APPROVED } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.PENDING } }),
      this.prisma.product.count({ where: { deletedAt: null, status: ProductStatus.REJECTED } }),
      this.prisma.province.count(),
      this.prisma.ward.count(),
      this.prisma.category.count(),
      this.prisma.news.count({ where: { deletedAt: null } }),
    ]);

    return {
      users,
      businesses,
      products,
      approvedProducts,
      pendingProducts,
      rejectedProducts,
      provinces,
      wards,
      categories,
      news,
    };
  }
}
