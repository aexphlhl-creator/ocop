import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoriesService, CategoryItem } from './categories.service';

@ApiTags('Categories')
@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh mục ngành hàng OCOP độc lập' })
  @ApiResponse({ status: 200, description: 'Danh sách các ngành hàng' })
  async findAll(): Promise<CategoryItem[]> {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một ngành hàng theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết ngành hàng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ngành hàng' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryItem> {
    return this.categoriesService.findOne(id);
  }
}
