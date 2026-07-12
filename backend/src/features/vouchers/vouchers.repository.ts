import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VouchersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.VoucherUncheckedCreateInput) {
    return this.prisma.voucher.create({ data });
  }

  async findAll(businessId?: string) {
    const where = businessId ? { OR: [{ businessId }, { businessId: null }] } : {};
    return this.prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        business: {
          select: { name: true }
        }
      }
    });
  }

  async findByCode(code: string) {
    return this.prisma.voucher.findUnique({
      where: { code },
      include: {
        business: true
      }
    });
  }

  async incrementUsage(id: string) {
    return this.prisma.voucher.update({
      where: { id },
      data: { usedCount: { increment: 1 } }
    });
  }
}
