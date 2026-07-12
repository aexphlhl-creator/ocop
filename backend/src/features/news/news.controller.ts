import { Controller, Post, Get, Patch, Delete, Param, Body, Query, UseGuards , ParseUUIDPipe} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { GetNewsQueryDto } from './dto/get-news-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@ApiTags('News')
@Controller('api/v1/news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bài viết tin tức mới (Chỉ dành cho ADMIN)' })
  @ApiResponse({ status: 201, description: 'Tạo bài viết tin tức thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không phải tài khoản quản trị ADMIN' })
  async create(@Body() dto: CreateNewsDto, @CurrentUser() user: RequestUser) {
    return this.newsService.create(dto, user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách bài viết tin tức (Công cộng, có phân trang và lọc)' })
  @ApiResponse({ status: 200, description: 'Danh sách bài viết tin tức. Khách vãng lai chỉ xem được PUBLISHED.' })
  async findAll(@Query() query: GetNewsQueryDto, @CurrentUser() user: RequestUser | null) {
    return this.newsService.findAll(query, user);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một bài viết tin tức theo Slug đường dẫn' })
  @ApiResponse({ status: 200, description: 'Chi tiết bài viết tin tức' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài viết hoặc bài viết ở trạng thái DRAFT' })
  async findOneBySlug(@Param('slug') slug: string, @CurrentUser() user: RequestUser | null) {
    return this.newsService.findOneBySlug(slug, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật bài viết tin tức theo ID (Chỉ dành cho ADMIN)' })
  @ApiResponse({ status: 200, description: 'Cập nhật bài viết thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền cập nhật' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài viết' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNewsDto) {
    return this.newsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa mềm bài viết tin tức theo ID (Chỉ dành cho ADMIN)' })
  @ApiResponse({ status: 200, description: 'Xóa bài viết thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền xóa' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài viết' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.remove(id);
  }
}
