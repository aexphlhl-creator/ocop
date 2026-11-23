import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  GoneException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';
import { CheckoutService } from './checkout.service';

@ApiTags('Orders')
@Controller('api/v1/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly checkoutService: CheckoutService,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Tạo đơn hàng mới (tự động reserve tồn kho)' })
  @ApiResponse({ status: 201, description: 'Đơn hàng được tạo thành công' })
  create() {
    throw new GoneException(
      'Endpoint này đã ngừng hoạt động. Sử dụng POST /api/v1/orders/checkout',
    );
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout nhiều gian hàng, reserve kho nguyên tử' })
  async checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.checkoutService.checkout(dto, user, ip);
  }

  // ── List Orders (Admin: all, Seller: direct ownership) ────────────────────

  @Get()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({
    summary: 'Danh sách đơn hàng (Admin: tất cả | Seller: của shop mình)',
  })
  async getOrders(
    @Query() query: QueryOrdersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.getOrders(query, user);
  }

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Thống kê tổng quan đơn hàng cho dashboard' })
  async getDashboard(@CurrentUser() user: RequestUser) {
    return this.ordersService.getDashboardStats(user);
  }

  // ── Customer: my orders ───────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Lấy danh sách đơn hàng của tôi (khách hàng)' })
  async getMyOrders(@CurrentUser() user: RequestUser) {
    return this.ordersService.getMyOrders(user);
  }

  // ── Seller: my shop orders ────────────────────────────────────────────────

  @Get('seller')
  @Roles(RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy danh sách đơn hàng của shop (Seller)' })
  async getSellerOrders(@CurrentUser() user: RequestUser) {
    return this.ordersService.getSellerOrders(user);
  }

  // ── Order Detail ──────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết đơn hàng' })
  async getOrderById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.getOrderById(id, user);
  }

  // ── Update Status (Seller/Admin) ──────────────────────────────────────────

  @Patch(':id/status')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({
    summary:
      'Cập nhật trạng thái xử lý đơn; vận chuyển/giao hàng đi qua Shipment',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress;
    return this.ordersService.updateOrderStatus(id, dto, user, ip);
  }

  // ── Cancel (Customer self-cancel) ─────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({
    summary: 'Hủy đơn hàng (khách hàng tự hủy khi PENDING/CONFIRMED)',
  })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress;
    return this.ordersService.cancelOrder(id, user, ip);
  }
}
