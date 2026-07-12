import { Controller, Get, Param, Query , ParseUUIDPipe} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WardsService } from './wards.service';
import { GetWardsQueryDto } from './dto/get-wards-query.dto';

@ApiTags('Wards')
@Controller('api/v1/wards')
export class WardsController {
  constructor(private readonly wardsService: WardsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách xã có phân trang, hỗ trợ lọc theo tỉnh/thành phố và tìm kiếm từ khóa' })
  @ApiResponse({ status: 200, description: 'Danh sách xã kèm theo metadata phân trang' })
  async findAll(@Query() query: GetWardsQueryDto) {
    return this.wardsService.findAll({
      provinceId: query.provinceId,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết của một xã theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết xã và tỉnh thành trực thuộc' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy xã' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.wardsService.findOne(id);
  }

  @Get(':id/geojson')
  @ApiOperation({ summary: 'Lấy dữ liệu ranh giới địa lý chi tiết GeoJSON của xã theo ID' })
  @ApiResponse({ status: 200, description: 'Dữ liệu tọa độ bản đồ số dạng GeoJSON' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy file ranh giới GeoJSON tương ứng' })
  async getGeoJson(@Param('id', ParseUUIDPipe) id: string) {
    return this.wardsService.getGeoJson(id);
  }
}
