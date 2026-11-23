import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RoleName } from '@prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Statistics')
@Controller('api/v1/statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Lấy các chỉ số thống kê tổng quan sản phẩm, người bán, ngành hàng (Công cộng)',
  })
  @ApiResponse({
    status: 200,
    description: 'Số lượng tổng quan của các thực thể',
  })
  async getOverview() {
    return this.statisticsService.getOverview();
  }

  @Get('export/excel')
  @ApiOperation({
    summary:
      'Xuất báo cáo số hóa OCOP toàn quốc dạng Excel chuẩn Bộ Nông nghiệp & PTNT',
  })
  @ApiResponse({
    status: 200,
    description: 'File Excel (.xlsx) gồm 3 sheet thống kê chuẩn',
  })
  async exportExcel(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.statisticsService.generateMasterExcelReport();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Bao_cao_so_hoa_OCOP_Bo_NNPTNT_${dateStr}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  @Get('products-by-province')
  @ApiOperation({
    summary: 'Thống kê số lượng sản phẩm theo từng tỉnh/thành phố (Công cộng)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách số lượng sản phẩm OCOP theo tỉnh thành',
  })
  async getProductsByProvince() {
    return this.statisticsService.getProductsByProvince();
  }

  @Get('products-by-category')
  @ApiOperation({
    summary: 'Thống kê số lượng sản phẩm theo từng ngành hàng (Công cộng)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách số lượng sản phẩm OCOP theo ngành hàng',
  })
  async getProductsByCategory() {
    return this.statisticsService.getProductsByCategory();
  }

  @Get('products-by-ocop-level')
  @ApiOperation({
    summary: 'Thống kê số lượng sản phẩm theo phân hạng sao OCOP (Công cộng)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách số lượng sản phẩm theo sao OCOP (3, 4, 5 sao)',
  })
  async getProductsByOcopLevel() {
    return this.statisticsService.getProductsByOcopLevel();
  }

  @Get('sellers-by-province')
  @ApiOperation({
    summary:
      'Thống kê số lượng chủ thể sản xuất theo từng tỉnh/thành phố (Công cộng)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách số lượng chủ thể theo tỉnh thành',
  })
  async getSellersByProvince() {
    return this.statisticsService.getSellersByProvince();
  }

  @Get('monthly-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Thống kê số lượng sản phẩm tạo mới trong 12 tháng gần nhất (Chỉ dành cho ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách số lượng sản phẩm theo tháng',
  })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập' })
  async getMonthlyProducts() {
    return this.statisticsService.getMonthlyProducts();
  }

  @Get('seller-views')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy số lượt xem sản phẩm trong tháng này của Seller',
  })
  @ApiResponse({ status: 200, description: 'Số lượt xem' })
  async getSellerViews(@CurrentUser() user: RequestUser) {
    const views = await this.statisticsService.getSellerViewsThisMonth(user.id);
    return { views };
  }

  // --- Analytics Dashboard API ---

  @Get('revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Biểu đồ doanh thu 30 ngày qua' })
  async getRevenue(
    @CurrentUser() user: RequestUser,
    @Query('days') days?: string,
    @Query('sellerId') querySellerId?: string,
  ) {
    const sellerId = user.role === RoleName.SELLER ? user.id : querySellerId;
    const daysNum = days ? parseInt(days) : 30;
    return this.statisticsService.getRevenue(daysNum, sellerId);
  }

  @Get('orders-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Biểu đồ trạng thái đơn hàng' })
  async getOrdersStatus(
    @CurrentUser() user: RequestUser,
    @Query('sellerId') querySellerId?: string,
  ) {
    const sellerId = user.role === RoleName.SELLER ? user.id : querySellerId;
    return this.statisticsService.getOrdersByStatus(sellerId);
  }

  @Get('top-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Biểu đồ top sản phẩm bán chạy' })
  async getTopProducts(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('sellerId') querySellerId?: string,
  ) {
    const sellerId = user.role === RoleName.SELLER ? user.id : querySellerId;
    const limitNum = limit ? parseInt(limit) : 5;
    return this.statisticsService.getTopProducts(limitNum, sellerId);
  }
}
