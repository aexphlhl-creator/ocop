import { Controller, Post, Get, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { GetBusinessesQueryDto } from './dto/get-businesses-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@ApiTags('Businesses')
@Controller('api/v1/businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo chủ thể sản xuất mới (Chỉ dành cho SELLER hoặc ADMIN)' })
  @ApiResponse({ status: 201, description: 'Tạo chủ thể sản xuất thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 409, description: 'Mã số thuế doanh nghiệp đã tồn tại' })
  async create(@Body() dto: CreateBusinessDto, @CurrentUser() user: RequestUser) {
    return this.businessesService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách chủ thể sản xuất (Công cộng, có phân trang và bộ lọc)' })
  @ApiResponse({ status: 200, description: 'Danh sách chủ thể kèm metadata phân trang' })
  async findAll(@Query() query: GetBusinessesQueryDto) {
    return this.businessesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một chủ thể sản xuất theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết chủ thể kèm Owner, địa giới và số lượng sản phẩm OCOP' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy chủ thể' })
  async findOne(@Param('id') id: string) {
    return this.businessesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin chủ thể sản xuất (Chủ sở hữu hoặc ADMIN)' })
  @ApiResponse({ status: 200, description: 'Cập nhật chủ thể thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền cập nhật chủ thể sản xuất này' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy chủ thể' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.businessesService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa mềm chủ thể sản xuất (Chủ sở hữu hoặc ADMIN)' })
  @ApiResponse({ status: 200, description: 'Xóa chủ thể thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền xóa chủ thể sản xuất này' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy chủ thể' })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.businessesService.remove(id, user);
  }
}
