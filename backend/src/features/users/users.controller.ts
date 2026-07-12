import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleName } from '@prisma/client';

@ApiTags('Users')
@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách Users (Hỗ trợ lọc)' })
  @ApiQuery({ name: 'assignable', required: false, type: Boolean, description: 'Lọc các user có thể assign làm Quản lý kho' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Tìm kiếm theo tên hoặc email' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Trang hiện tại' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số bản ghi trên mỗi trang' })
  @ApiQuery({ name: 'sort', required: false, type: String, description: 'Sắp xếp theo trường (mặc định: fullName)' })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'], description: 'Chiều sắp xếp (mặc định: asc)' })
  async getUsers(
    @Query('assignable') assignable?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc'
  ) {
    const isAssignable = assignable === 'true';
    return this.usersService.getUsers(isAssignable, search, page, limit, sort, order);
  }
}
