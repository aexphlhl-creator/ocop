import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VouchersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.VoucherUncheckedCreateInput) {
    return this.prisma.voucher.create({ data });
  }

  async findAll(sellerId?: string) {
    const where = sellerId ? { OR: [{ sellerId }, { sellerId: null }] } : {};
    return this.prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        seller: { select: { id: true, fullName: true, sellerProfile: true } },
      },
    });
  }

  async findByCode(code: string) {
    return this.prisma.voucher.findUnique({
      where: { code },
      include: {
        seller: { include: { sellerProfile: true } },
      },
    });
  }

  async incrementUsage(id: string) {
    return this.prisma.voucher.update({
      where: { id },
      data: { usedCount: { increment: 1 } },
    });
  }

  async findById(id: string) {
    return this.prisma.voucher.findUnique({
      where: { id },
      include: {
        seller: { include: { sellerProfile: true } },
        _count: {
          select: {
            platformOrders: true,
            shopOrders: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.voucher.delete({
      where: { id },
    });
  }

  async update(id: string, data: Prisma.VoucherUncheckedUpdateInput) {
    return this.prisma.voucher.update({
      where: { id },
      data,
    });
  }
}
