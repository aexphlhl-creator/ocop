import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvincesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.province.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        latitude: true,
        longitude: true,
        bounds: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.province.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        latitude: true,
        longitude: true,
        bounds: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByCode(code: string) {
    return this.prisma.province.findUnique({
      where: { code },
    });
  }

  async countWards(provinceId: string): Promise<number> {
    return this.prisma.ward.count({
      where: { provinceId },
    });
  }
}
