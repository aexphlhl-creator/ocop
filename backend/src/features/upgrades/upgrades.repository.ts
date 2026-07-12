import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UpgradeStatus } from '@prisma/client';

@Injectable()
export class UpgradesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.OcopUpgradeRequestCreateInput) {
    return this.prisma.ocopUpgradeRequest.create({
      data,
      include: {
        product: true,
        currentLevel: true,
        targetLevel: true,
      }
    });
  }

  async findByBusinessId(businessId: string) {
    return this.prisma.ocopUpgradeRequest.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: { id: true, name: true, images: true }
        },
        currentLevel: true,
        targetLevel: true,
      }
    });
  }

  async findAll() {
    return this.prisma.ocopUpgradeRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: { id: true, name: true, images: true }
        },
        business: {
          select: { id: true, name: true }
        },
        currentLevel: true,
        targetLevel: true,
      }
    });
  }

  async findById(id: string) {
    return this.prisma.ocopUpgradeRequest.findUnique({
      where: { id },
      include: {
        product: true,
        business: true,
        currentLevel: true,
        targetLevel: true,
      }
    });
  }

  async updateStatus(id: string, status: UpgradeStatus, adminComment?: string) {
    return this.prisma.ocopUpgradeRequest.update({
      where: { id },
      data: { status, adminComment },
    });
  }
}
