import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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

  @Get('seller-views')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy số lượt xem sản phẩm trong tháng này của Seller' })
  @ApiResponse({ status: 200, description: 'Số lượt xem' })
  async getSellerViews(@CurrentUser() user: any) {
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
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('businessId') queryBusinessId?: string
  ) {
    let businessId: string | undefined = queryBusinessId;
    // Nếu là SELLER, chỉ cho phép xem của shop mình
    if (user.role === RoleName.SELLER) {
      // Vì StatisticsService không trực tiếp gọi Prisma Business, 
      // ta có thể truyền role SELLER và userId xuống Service để xử lý hoặc service nhận businessId.
      // Tạm thời truyền thông số để lọc bên Service hoặc Repo
      businessId = user.id; // Ta sẽ quy ước nếu truyền businessId mà là uuid của user thì xử lý bên dưới.
      // Cách tốt nhất: Để Service tự lookup businessId từ userId. 
      // Nhưng để nhanh, ta sẽ dùng Prisma trong StatisticsRepository hoặc Service.
    }
    const daysNum = days ? parseInt(days) : 30;
    return this.statisticsService.getRevenue(daysNum, user.role === RoleName.SELLER ? user.id : businessId, user.role === RoleName.SELLER);
  }

  @Get('orders-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Biểu đồ trạng thái đơn hàng' })
  async getOrdersStatus(
    @CurrentUser() user: any,
    @Query('businessId') queryBusinessId?: string
  ) {
    let businessId = queryBusinessId;
    if (user.role === RoleName.SELLER) {
      businessId = user.id;
    }
    return this.statisticsService.getOrdersByStatus(user.role === RoleName.SELLER ? user.id : businessId, user.role === RoleName.SELLER);
  }

  @Get('top-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Biểu đồ top sản phẩm bán chạy' })
  async getTopProducts(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('businessId') queryBusinessId?: string
  ) {
    let businessId = queryBusinessId;
    if (user.role === RoleName.SELLER) {
      businessId = user.id;
    }
    const limitNum = limit ? parseInt(limit) : 5;
    return this.statisticsService.getTopProducts(limitNum, user.role === RoleName.SELLER ? user.id : businessId, user.role === RoleName.SELLER);
  }
}
