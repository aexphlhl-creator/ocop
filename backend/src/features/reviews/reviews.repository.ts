import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ProductReviewCreateInput) {
    return this.prisma.productReview.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });
  }

  async findByProductId(productId: string) {
    return this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.productReview.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            images: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!review) return null;

    await this.prisma.productReview.delete({ where: { id } });
    return review;
  }

  async updateProductStats(productId: string) {
    const agg = await this.prisma.productReview.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { id: true },
    });

    const averageRating = agg._avg.rating || 0;
    const reviewCount = agg._count.id;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        averageRating,
        reviewCount,
      },
    });

    return { averageRating, reviewCount };
  }
}
