import { Injectable, NotFoundException } from '@nestjs/common';
import { ProvincesRepository } from './provinces.repository';
import { RedisService } from '../redis/redis.service';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class ProvincesService {
  private readonly CACHE_KEY_LIST = 'provinces:list';
  private readonly CACHE_TTL_LIST = 3600; // 1 giờ (3600 giây)

  constructor(
    private readonly provincesRepository: ProvincesRepository,
    private readonly redisService: RedisService,
  ) {}

  async findAll() {
    const cachedData = await this.redisService.get(this.CACHE_KEY_LIST);
    if (cachedData) {
      return JSON.parse(cachedData) as Awaited<
        ReturnType<ProvincesRepository['findAll']>
      >;
    }

    const provinces = await this.provincesRepository.findAll();
    await this.redisService.set(
      this.CACHE_KEY_LIST,
      JSON.stringify(provinces),
      this.CACHE_TTL_LIST,
    );
    return provinces;
  }

  async findOne(id: string) {
    const province = await this.provincesRepository.findById(id);
    if (!province) {
      throw new NotFoundException(`Tỉnh/Thành phố có ID "${id}" không tồn tại`);
    }

    const wardsCount = await this.provincesRepository.countWards(id);
    return {
      ...province,
      wardsCount,
    };
  }

  async getGeoJson(code: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
      throw new NotFoundException('Mã tỉnh/thành phố không hợp lệ');
    }
    const province = await this.provincesRepository.findByCode(code);
    if (!province) {
      throw new NotFoundException(
        `Tỉnh/Thành phố có mã "${code}" không tồn tại`,
      );
    }

    const fileName = `${code}.geojson`;
    const filePath = join(
      process.cwd(),
      'assets',
      'geojson',
      'provinces',
      fileName,
    );

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- code is validated as one path segment under the fixed provinces directory.
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as unknown;
    } catch {
      throw new NotFoundException(
        `Không tìm thấy dữ liệu bản đồ số GeoJSON của tỉnh/thành phố mã "${code}"`,
      );
    }
  }
}
