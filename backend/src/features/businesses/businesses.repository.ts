import { Injectable } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
    includeInactive?: boolean;
  }) {
    const where: Prisma.SellerProfileWhereInput = {
      seller: {
        role: { name: RoleName.SELLER },
        ...(params.includeInactive ? {} : { isActive: true }),
      },
    };
    if (params.search) {
      where.OR = [
        { displayName: { contains: params.search, mode: 'insensitive' } },
        { taxCode: { contains: params.search, mode: 'insensitive' } },
        { address: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        {
          seller: {
            fullName: { contains: params.search, mode: 'insensitive' },
          },
        },
      ];
    }
    if (params.provinceId) where.provinceId = params.provinceId;
    if (params.wardId) where.wardId = params.wardId;
    if (params.verified !== undefined) where.isVerified = params.verified;
    if (params.ownerId) where.sellerId = params.ownerId;

    const include = {
      seller: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          _count: {
            select: { sellerProducts: { where: { deletedAt: null } } },
          },
          sellerProducts: {
            where: { deletedAt: null, status: 'APPROVED' },
            take: 3,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              price: true,
              images: { take: 1, select: { imageUrl: true } },
              ocopLevel: { select: { level: true, title: true } },
            },
          },
        },
      },
      province: { select: { id: true, name: true, code: true } },
      ward: { select: { id: true, name: true } },
    } satisfies Prisma.SellerProfileInclude;

    const [items, total] = await Promise.all([
      this.prisma.sellerProfile.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);
    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.sellerProfile.findFirst({
      where: { OR: [{ id }, { sellerId: id }] },
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
            _count: {
              select: { sellerProducts: { where: { deletedAt: null } } },
            },
            sellerProducts: {
              where: { deletedAt: null, status: 'APPROVED' },
              take: 6,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                name: true,
                price: true,
                images: { take: 1, select: { imageUrl: true } },
                ocopLevel: { select: { level: true, title: true } },
              },
            },
          },
        },
        province: { select: { id: true, name: true, code: true } },
        ward: { select: { id: true, name: true } },
      },
    });
  }

  async findByTaxCode(taxCode: string) {
    return this.prisma.sellerProfile.findUnique({ where: { taxCode } });
  }

  async findByUserId(userId: string) {
    return this.prisma.sellerProfile.findUnique({
      where: { sellerId: userId },
    });
  }

  async isSeller(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, role: { name: RoleName.SELLER } },
      select: { id: true, fullName: true, email: true, phone: true },
    });
  }

  async create(data: Prisma.SellerProfileCreateInput) {
    return this.prisma.sellerProfile.create({
      data,
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        province: { select: { id: true, name: true, code: true } },
        ward: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: Prisma.SellerProfileUpdateInput) {
    return this.prisma.sellerProfile.update({
      where: { id },
      data,
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
            _count: {
              select: { sellerProducts: { where: { deletedAt: null } } },
            },
          },
        },
        province: { select: { id: true, name: true, code: true } },
        ward: { select: { id: true, name: true } },
      },
    });
  }

  async deactivateSeller(profileId: string) {
    const profile = await this.prisma.sellerProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: { sellerId: true },
    });
    return this.prisma.user.update({
      where: { id: profile.sellerId },
      data: { isActive: false },
    });
  }
}
