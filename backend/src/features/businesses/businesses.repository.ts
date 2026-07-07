import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BusinessesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAndCount(params: {
    skip: number;
    take: number;
    search?: string;
    provinceId?: string;
    wardId?: string;
    verified?: boolean;
    ownerId?: string;
  }) {
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { taxCode: { contains: params.search, mode: 'insensitive' } },
        { address: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.provinceId) {
      where.provinceId = params.provinceId;
    }
    if (params.wardId) {
      where.wardId = params.wardId;
    }
    if (params.verified !== undefined) {
      where.isVerified = params.verified;
    }
    if (params.ownerId) {
      where.userId = params.ownerId;
    }

    const [items, total] = await Promise.all([
      this.prisma.business.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          province: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          ward: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.business.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.business.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        province: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        ward: {
          select: {
            id: true,
            name: true,
          },
        },
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
    });
  }

  async findByTaxCode(taxCode: string) {
    return this.prisma.business.findFirst({
      where: {
        taxCode,
        deletedAt: null,
      },
    });
  }

  async create(data: Prisma.BusinessCreateInput) {
    return this.prisma.business.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        province: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        ward: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.BusinessUpdateInput) {
    return this.prisma.business.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        province: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        ward: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async softDelete(id: string) {
    return this.prisma.business.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
