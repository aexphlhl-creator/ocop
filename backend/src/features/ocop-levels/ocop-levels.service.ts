import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface OcopLevelItem {
  id: string;
  level: number;
  title: string;
  color: string | null;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OcopLevelsService {
  private readonly CACHE_KEY_LIST = 'ocop_levels:list';
  private readonly CACHE_TTL_LIST = 3600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(): Promise<OcopLevelItem[]> {
    try {
      const cachedData = await this.redisService.get(this.CACHE_KEY_LIST);
      if (cachedData) {
        return JSON.parse(cachedData) as OcopLevelItem[];
      }
    } catch {
      // Redis fallback
    }

    const levels = await this.prisma.ocopLevel.findMany({
      orderBy: { level: 'asc' },
      select: {
        id: true,
        level: true,
        title: true,
        color: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    try {
      await this.redisService.set(
        this.CACHE_KEY_LIST,
        JSON.stringify(levels),
        this.CACHE_TTL_LIST,
      );
    } catch {
      // Redis fallback
    }

    return levels;
  }

  async findOne(id: string): Promise<OcopLevelItem> {
    const level = await this.prisma.ocopLevel.findUnique({
      where: { id },
      select: {
        id: true,
        level: true,
        title: true,
        color: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!level) {
      throw new NotFoundException(`Cấp sao OCOP có ID "${id}" không tồn tại`);
    }

    return level;
  }
}
