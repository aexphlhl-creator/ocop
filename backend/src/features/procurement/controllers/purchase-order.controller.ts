import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards, DefaultValuePipe, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { CreatePurchaseOrderDto } from '../dto/purchase-order.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Tạo đơn mua hàng mới' })
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.createPurchaseOrder(dto, user);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy danh sách đơn mua hàng' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'buyerId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search') search: string,
    @Query('status') status: string,
    @Query('supplierId') supplierId: string,
    @Query('warehouseId') warehouseId: string,
    @Query('buyerId') buyerId: string,
    @Query('productId') productId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.purchaseOrderService.getPurchaseOrders({ 
      page, limit, search, status, supplierId, warehouseId, buyerId, productId, startDate, endDate 
    }, user);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết đơn mua hàng' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.getPurchaseOrderById(id, user);
  }

  @Patch(':id/submit')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Trình duyệt đơn mua hàng' })
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.submitPurchaseOrder(id, user);
  }

  @Patch(':id/approve')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Phê duyệt đơn mua hàng' })
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.approvePurchaseOrder(id, user);
  }

  @Patch(':id/request-revision')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Yêu cầu sửa đổi đơn mua hàng' })
  requestRevision(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.requestRevision(id, reason || 'Cần chỉnh sửa', user);
  }

  @Patch(':id/order')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Đặt hàng' })
  order(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.orderPurchaseOrder(id, user);
  }

  @Patch(':id/receiving')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Chuyển sang trạng thái đang nhận hàng' })
  markAsReceiving(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.markAsReceiving(id, user);
  }

  @Patch(':id/complete')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Hoàn thành đơn hàng' })
  markCompleted(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.markCompleted(id, user);
  }

  @Patch(':id/close')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Đóng đơn hàng' })
  markClosed(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.markClosed(id, user);
  }

  @Patch(':id/cancel')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Hủy đơn mua hàng' })
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.purchaseOrderService.cancelPurchaseOrder(id, user);
  }

  @Get(':id/export-pdf')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Xuất file PDF của PO' })
  exportPdf(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    // In a real implementation, this would generate a PDF buffer using pdfkit/puppeteer and stream it back.
    // For now, we return a mock URL.
    return {
      success: true,
      url: `/api/v1/purchase-orders/${id}/pdf-download-link`,
      message: 'PDF generation is scheduled.'
    };
  }
}
