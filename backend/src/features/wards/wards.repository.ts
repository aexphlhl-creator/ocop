import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class WardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAndCount(params: {
    provinceId?: string;
    search?: string;
    skip: number;
    take: number;
  }) {
    const where: Prisma.WardWhereInput = {};

    if (params.provinceId) {
      where.provinceId = params.provinceId;
    }

    if (params.search) {
      where.name = {
        contains: params.search,
        mode: 'insensitive',
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.ward.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          avatar: true,
          description: true,
          provinceId: true,
          bounds: true,
          geojsonPath: true,
        },
      }),
      this.prisma.ward.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.ward.findUnique({
      where: { id },
      include: {
        province: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }
}
