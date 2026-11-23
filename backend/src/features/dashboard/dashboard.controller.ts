import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';

@ApiTags('Dashboard')
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Lấy các chỉ số thống kê tổng hợp số lượng bản ghi (Chỉ dành cho ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chỉ số thống kê thành công',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            users: { type: 'number', example: 12 },
            sellers: { type: 'number', example: 5 },
            products: { type: 'number', example: 25 },
            approvedProducts: { type: 'number', example: 18 },
            pendingProducts: { type: 'number', example: 5 },
            rejectedProducts: { type: 'number', example: 2 },
            provinces: { type: 'number', example: 34 },
            wards: { type: 'number', example: 100 },
            categories: { type: 'number', example: 6 },
            news: { type: 'number', example: 15 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({
    status: 403,
    description: 'Không phải tài khoản quản trị ADMIN',
  })
  async getCounts() {
    return this.dashboardService.getCounts();
  }
}
