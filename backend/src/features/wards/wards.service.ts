import { Injectable, NotFoundException } from '@nestjs/common';
import { WardsRepository } from './wards.repository';
import { RedisService } from '../redis/redis.service';
import { createPaginationResponse } from '../../common/pagination/pagination.helper';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class WardsService {
  private readonly CACHE_TTL_LIST = 600; // 10 phút (600 giây)

  constructor(
    private readonly wardsRepository: WardsRepository,
    private readonly redisService: RedisService,
  ) {}

  async findAll(params: {
    provinceId?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const { provinceId, search, page, limit } = params;
    const cacheKey = `wards:list:prov_${provinceId || 'all'}:search_${search || ''}:page_${page}:limit_${limit}`;

    const cachedData = await this.redisService.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const { items, total } = await this.wardsRepository.findAndCount({
      provinceId,
      search,
      skip,
      take,
    });

    const response = createPaginationResponse(items, total, page, limit);

    await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL_LIST);
    return response;
  }

  async findOne(id: string) {
    const ward = await this.wardsRepository.findById(id);
    if (!ward) {
      throw new NotFoundException(`Xã có ID "${id}" không tồn tại`);
    }
    return ward;
  }

  async getGeoJson(id: string) {
    const ward = await this.wardsRepository.findById(id);
    if (!ward) {
      throw new NotFoundException(`Xã có ID "${id}" không tồn tại`);
    }

    if (!ward.geojsonPath) {
      throw new NotFoundException(`Dữ liệu bản đồ số GeoJSON của xã ID "${id}" chưa được cấu hình`);
    }

    const filePath = join(process.cwd(), ward.geojsonPath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      throw new NotFoundException(`Không tìm thấy file ranh giới GeoJSON của xã tại đường dẫn "${ward.geojsonPath}"`);
    }
  }
}
