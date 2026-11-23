import {
  Controller,
  Body,
  Get,
  GoneException,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateWarehouseManagerDto } from './dto/create-warehouse-manager.dto';
import { UpdateSellerStatusDto } from './dto/update-seller-status.dto';

@ApiTags('Users')
@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('sellers')
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Tạo tài khoản SELLER và hồ sơ người bán (chỉ Admin)',
  })
  createSeller(@Body() dto: CreateWarehouseManagerDto) {
    return this.usersService.createSeller(dto);
  }

  @Patch('sellers/:id/status')
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Khóa hoặc kích hoạt lại tài khoản SELLER (chỉ Admin)',
  })
  updateSellerStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSellerStatusDto,
  ) {
    return this.usersService.updateSellerStatus(id, dto.isActive);
  }

  @Post('warehouse-managers')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Tạo tài khoản quản lý kho (chỉ Admin)' })
  createWarehouseManager(@Body() dto: CreateWarehouseManagerDto) {
    return this.usersService.createWarehouseManager(dto);
  }

  @Post('quality-assurance')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Tạo tài khoản QA/QC độc lập (chỉ Admin)' })
  createQualityAssurance(@Body() dto: CreateWarehouseManagerDto) {
    return this.usersService.createQualityAssurance(dto);
  }

  @Get('quality-assurance')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Danh sách tài khoản QA/QC đang hoạt động' })
  getQualityAssuranceUsers(@Query('search') search?: string) {
    return this.usersService.getQualityAssuranceUsers(search);
  }

  @Post('logistics')
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Đã ngừng: hệ thống không tạo nhân viên vận chuyển nội bộ',
  })
  createLogisticsUser() {
    throw new GoneException(
      'Hệ thống chỉ quản lý hãng vận chuyển bên ngoài và nhận tracking qua webhook/API của hãng.',
    );
  }

  @Get('logistics')
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Đã ngừng: không dùng danh sách nhân viên vận chuyển nội bộ',
  })
  getLogisticsUsers() {
    throw new GoneException(
      'Trạng thái giao hàng thuộc trách nhiệm của hãng vận chuyển, không thuộc tài khoản nội bộ.',
    );
  }

  @Get()
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách Users (Hỗ trợ lọc)' })
  @ApiQuery({
    name: 'assignable',
    required: false,
    type: Boolean,
    description: 'Lọc các user có thể assign làm Quản lý kho',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Tìm kiếm theo tên hoặc email',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Trang hiện tại',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Số bản ghi trên mỗi trang',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    description: 'Sắp xếp theo trường (mặc định: fullName)',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Chiều sắp xếp (mặc định: asc)',
  })
  async getUsers(
    @Query('assignable') assignable?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    const isAssignable = assignable === 'true';
    return this.usersService.getUsers(
      isAssignable,
      search,
      page,
      limit,
      sort,
      order,
    );
  }
}
