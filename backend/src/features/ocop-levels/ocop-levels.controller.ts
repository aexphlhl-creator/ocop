import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OcopLevelsService, OcopLevelItem } from './ocop-levels.service';

@ApiTags('OcopLevels')
@Controller('api/v1/ocop-levels')
export class OcopLevelsController {
  constructor(private readonly ocopLevelsService: OcopLevelsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh mục cấp sao OCOP độc lập (3 Sao, 4 Sao, 5 Sao)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách các cấp sao OCOP' })
  async findAll(): Promise<OcopLevelItem[]> {
    return this.ocopLevelsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một cấp sao OCOP theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết cấp sao' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cấp sao' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OcopLevelItem> {
    return this.ocopLevelsService.findOne(id);
  }
}
