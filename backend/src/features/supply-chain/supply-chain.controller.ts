import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SupplyChainService } from './supply-chain.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { QueryHistoryDto } from './dto/query-history.dto';

@ApiTags('Supply Chain')
@Controller('api/v1/supply-chain')
export class SupplyChainController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  // ── Stages (lookup) ───────────────────────────────────────────────────────

  @Get('stages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách tất cả công đoạn chuỗi cung ứng' })
  async getStages() {
    return this.supplyChainService.getStages();
  }

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thống kê tổng quan Supply Chain Dashboard' })
  async getDashboardStats(@CurrentUser() user: RequestUser) {
    return this.supplyChainService.getDashboardStats(user);
  }

  // ── History ───────────────────────────────────────────────────────────────

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lịch sử hành trình (filter theo stage, date, actor, batch)',
  })
  async getHistory(
    @Query() query: QueryHistoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supplyChainService.getHistory(query, user);
  }

  // ── Product Supply Chain (Public — dùng cho QR) ───────────────────────────

  @Get('product/:productId')
  @ApiOperation({
    summary:
      'Lấy chuỗi cung ứng theo sản phẩm (public, dùng cho QR Traceability)',
  })
  @ApiResponse({ status: 200, description: 'Thông tin product + batches + journeys' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại' })
  async getProductSupplyChain(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.supplyChainService.getProductSupplyChain(productId);
  }

  // ── Batch Journey ─────────────────────────────────────────────────────────

  @Get('batch/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy chi tiết batch + toàn bộ timeline hành trình' })
  @ApiResponse({ status: 200, description: 'Batch + journeys timeline' })
  @ApiResponse({ status: 404, description: 'Batch không tồn tại' })
  async getBatchJourney(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supplyChainService.getBatchJourney(batchId, user);
  }

  @Post('batch/:batchId/journey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thêm một bước hành trình mới cho batch (append-only, không sửa/xóa được)',
  })
  @ApiResponse({ status: 201, description: 'Journey đã được thêm thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền' })
  @ApiResponse({ status: 404, description: 'Batch hoặc Stage không tồn tại' })
  async addJourney(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: CreateJourneyDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;

    return this.supplyChainService.addJourney(batchId, dto, user, ipAddress);
  }
}
