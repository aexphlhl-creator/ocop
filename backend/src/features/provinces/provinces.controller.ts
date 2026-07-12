import { Controller, Get, Param , ParseUUIDPipe} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProvincesService } from './provinces.service';

@ApiTags('Provinces')
@Controller('api/v1/provinces')
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách 34 tỉnh/thành phố của Việt Nam (Sắp xếp theo tên tăng dần)' })
  @ApiResponse({ status: 200, description: 'Danh sách tỉnh thành phố và tọa độ ranh giới bao quanh' })
  async findAll() {
    return this.provincesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết của một tỉnh/thành phố kèm số lượng xã' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết và số lượng xã trực thuộc' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tỉnh/thành phố' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.provincesService.findOne(id);
  }

  @Get(':code/geojson')
  @ApiOperation({ summary: 'Lấy dữ liệu ranh giới địa lý chi tiết GeoJSON của tỉnh/thành phố theo mã' })
  @ApiResponse({ status: 200, description: 'Dữ liệu tọa độ bản đồ số dạng GeoJSON' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy file ranh giới GeoJSON tương ứng' })
  async getGeoJson(@Param('code') code: string) {
    return this.provincesService.getGeoJson(code);
  }
}
