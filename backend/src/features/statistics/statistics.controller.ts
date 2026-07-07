import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';

@ApiTags('Statistics')
@Controller('api/v1/statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Lấy các chỉ số thống kê tổng quan sản phẩm, doanh nghiệp, ngành hàng (Công cộng)' })
  @ApiResponse({ status: 200, description: 'Số lượng tổng quan của các thực thể' })
  async getOverview() {
    return this.statisticsService.getOverview();
  }

  @Get('products-by-province')
  @ApiOperation({ summary: 'Thống kê số lượng sản phẩm theo từng tỉnh/thành phố (Công cộng)' })
  @ApiResponse({ status: 200, description: 'Danh sách số lượng sản phẩm OCOP theo tỉnh thành' })
  async getProductsByProvince() {
    return this.statisticsService.getProductsByProvince();
  }

  @Get('products-by-category')
  @ApiOperation({ summary: 'Thống kê số lượng sản phẩm theo từng ngành hàng (Công cộng)' })
  @ApiResponse({ status: 200, description: 'Danh sách số lượng sản phẩm OCOP theo ngành hàng' })
  async getProductsByCategory() {
    return this.statisticsService.getProductsByCategory();
  }

  @Get('products-by-ocop-level')
  @ApiOperation({ summary: 'Thống kê số lượng sản phẩm theo phân hạng sao OCOP (Công cộng)' })
  @ApiResponse({ status: 200, description: 'Danh sách số lượng sản phẩm theo sao OCOP (3, 4, 5 sao)' })
  async getProductsByOcopLevel() {
    return this.statisticsService.getProductsByOcopLevel();
  }

  @Get('businesses-by-province')
  @ApiOperation({ summary: 'Thống kê số lượng chủ thể sản xuất theo từng tỉnh/thành phố (Công cộng)' })
  @ApiResponse({ status: 200, description: 'Danh sách số lượng chủ thể theo tỉnh thành' })
  async getBusinessesByProvince() {
    return this.statisticsService.getBusinessesByProvince();
  }

  @Get('monthly-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thống kê số lượng sản phẩm tạo mới trong 12 tháng gần nhất (Chỉ dành cho ADMIN)' })
  @ApiResponse({ status: 200, description: 'Danh sách số lượng sản phẩm theo tháng' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập' })
  async getMonthlyProducts() {
    return this.statisticsService.getMonthlyProducts();
  }
}
