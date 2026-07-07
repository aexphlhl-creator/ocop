import { Injectable, NotFoundException } from '@nestjs/common';
import { NewsRepository } from './news.repository';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { GetNewsQueryDto } from './dto/get-news-query.dto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RedisService } from '../redis/redis.service';
import { RoleName, NewsStatus } from '@prisma/client';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';

@Injectable()
export class NewsService {
  private readonly CACHE_TTL = 600; // 10 phút

  constructor(
    private readonly newsRepository: NewsRepository,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateNewsDto, currentUser: RequestUser) {
    const baseSlug = this.slugify(dto.title);
    let finalSlug = baseSlug;
    const existing = await this.newsRepository.findBySlug(finalSlug);
    if (existing) {
      finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    const newsInput = {
      title: dto.title,
      slug: finalSlug,
      content: dto.content,
      thumbnail: dto.thumbnail,
      status: dto.status,
      author: { connect: { id: currentUser.id } },
    };

    const news = await this.newsRepository.create(newsInput);
    await this.clearNewsListCache();
    await this.clearDashboardAndStatsCache();
    return news;
  }

  async findAll(query: GetNewsQueryDto, currentUser?: RequestUser | null) {
    const { page, limit, keyword, status } = query;

    // Chặn người dùng thường xem bản nháp (DRAFT)
    let targetStatus = status;
    if (!currentUser || currentUser.role !== RoleName.ADMIN) {
      targetStatus = NewsStatus.PUBLISHED;
    }

    const cacheKey = `news:list:k_${keyword || ''}:s_${targetStatus || 'all'}:pg_${page}:lim_${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const { items, total } = await this.newsRepository.findAndCount({
      skip,
      take,
      keyword,
      status: targetStatus,
    });

    const response = createPaginationResponse(items, total, page, limit);
    await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    return response;
  }

  async findOneBySlug(slug: string, currentUser?: RequestUser | null) {
    const news = await this.newsRepository.findBySlug(slug);
    if (!news) {
      throw new NotFoundException(`Không tìm thấy bài viết tin tức với đường dẫn "${slug}"`);
    }

    // Nếu bài viết nháp mà không phải Admin xem thì ẩn đi (404)
    if (news.status === NewsStatus.DRAFT) {
      if (!currentUser || currentUser.role !== RoleName.ADMIN) {
        throw new NotFoundException(`Không tìm thấy bài viết tin tức với đường dẫn "${slug}"`);
      }
    }

    return news;
  }

  async update(id: string, dto: UpdateNewsDto) {
    const existing = await this.newsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy bài viết tin tức với ID "${id}"`);
    }

    let finalSlug = existing.slug;
    if (dto.title && dto.title !== existing.title) {
      const baseSlug = this.slugify(dto.title);
      finalSlug = baseSlug;
      const existingSlug = await this.newsRepository.findBySlug(finalSlug);
      if (existingSlug && existingSlug.id !== id) {
        finalSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
      }
    }

    const updateData = {
      title: dto.title,
      slug: finalSlug,
      content: dto.content,
      thumbnail: dto.thumbnail,
      status: dto.status,
    };

    const updated = await this.newsRepository.update(id, updateData);
    await this.clearNewsListCache();
    await this.clearDashboardAndStatsCache();
    return updated;
  }

  async remove(id: string) {
    const existing = await this.newsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy bài viết tin tức với ID "${id}"`);
    }

    await this.newsRepository.softDelete(id);
    await this.clearNewsListCache();
    await this.clearDashboardAndStatsCache();
    return { id, message: 'Xóa bài viết thành công' };
  }

  private async clearNewsListCache() {
    try {
      const client = this.redisService.getClient();
      const keys = await client.keys('news:list:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch {
      // Bỏ qua lỗi kết nối Redis
    }
  }

  private async clearDashboardAndStatsCache() {
    try {
      const client = this.redisService.getClient();
      // Invalidate dashboard và statistics caches
      const keys = await client.keys('dashboard:*');
      const statsKeys = await client.keys('statistics:*');
      const allKeys = [...keys, ...statsKeys];
      if (allKeys.length > 0) {
        await client.del(...allKeys);
      }
    } catch {
      // Bỏ qua lỗi kết nối Redis
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
