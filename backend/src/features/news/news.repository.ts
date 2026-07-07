import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, NewsStatus } from '@prisma/client';

@Injectable()
export class NewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAndCount(params: {
    skip: number;
    take: number;
    keyword?: string;
    status?: NewsStatus;
  }) {
    const where: Prisma.NewsWhereInput = {
      deletedAt: null,
    };

    if (params.keyword) {
      where.OR = [
        { title: { contains: params.keyword, mode: 'insensitive' } },
        { content: { contains: params.keyword, mode: 'insensitive' } },
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.news.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.news.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.news.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async create(data: Prisma.NewsCreateInput) {
    return this.prisma.news.create({
      data,
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.NewsUpdateInput) {
    return this.prisma.news.update({
      where: { id },
      data,
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async softDelete(id: string) {
    return this.prisma.news.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
