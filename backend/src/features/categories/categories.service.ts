import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CategoriesService {
  private readonly CACHE_KEY_LIST = 'categories:list';
  private readonly CACHE_TTL_LIST = 3600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(): Promise<CategoryItem[]> {
    try {
      const cachedData = await this.redisService.get(this.CACHE_KEY_LIST);
      if (cachedData) {
        return JSON.parse(cachedData) as CategoryItem[];
      }
    } catch {
      // Redis fallback
    }

    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    try {
      await this.redisService.set(
        this.CACHE_KEY_LIST,
        JSON.stringify(categories),
        this.CACHE_TTL_LIST,
      );
    } catch {
      // Redis fallback
    }

    return categories;
  }

  async findOne(id: string): Promise<CategoryItem> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Ngành hàng có ID "${id}" không tồn tại`);
    }

    return category;
  }
}
