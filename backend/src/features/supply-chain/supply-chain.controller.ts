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
import {
  CreateTraceabilityLocationDto,
  CreateTraceabilityPartyDto,
  DeclareBatchOriginDto,
  LinkBatchMaterialDto,
  VerifyTraceabilityPartyDto,
} from './dto/traceability-master-data.dto';
import {
  CreateProductionBatchDto,
  IdempotentLotActionDto,
  InspectProductionBatchDto,
  PutAwayProductionBatchDto,
  ReceiveProductionBatchDto,
} from './dto/production-batch.dto';
import { TraceabilityMasterDataService } from './traceability-master-data.service';

@ApiTags('Supply Chain')
@Controller('api/v1/supply-chain')
export class SupplyChainController {
  constructor(
    private readonly supplyChainService: SupplyChainService,
    private readonly traceabilityMasterDataService: TraceabilityMasterDataService,
  ) {}

  @Get('traceability/parties')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách chủ thể và địa điểm nguồn gốc' })
  listTraceabilityParties(@CurrentUser() user: RequestUser) {
    return this.traceabilityMasterDataService.listParties(user);
  }

  @Post('traceability/parties')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo chủ thể nguồn gốc; Seller tạo ở trạng thái chờ xác minh',
  })
  createTraceabilityParty(
    @Body() dto: CreateTraceabilityPartyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.traceabilityMasterDataService.createParty(dto, user);
  }

  @Post('traceability/parties/:partyId/locations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo địa điểm vật lý thuộc chủ thể nguồn gốc' })
  createTraceabilityLocation(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Body() dto: CreateTraceabilityLocationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.traceabilityMasterDataService.createLocation(
      partyId,
      dto,
      user,
    );
  }

  @Post('traceability/parties/:partyId/verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin xác minh hoặc thu hồi xác minh chủ thể nguồn gốc',
  })
  verifyTraceabilityParty(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Body() dto: VerifyTraceabilityPartyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.traceabilityMasterDataService.verifyParty(
      partyId,
      dto.verified,
      user,
    );
  }

  @Post('batch/:batchId/origin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER, RoleName.WAREHOUSE_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khai báo hoặc hiệu chỉnh nguồn gốc lô theo revision bất biến',
  })
  declareBatchOrigin(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: DeclareBatchOriginDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.traceabilityMasterDataService.declareBatchOrigin(
      batchId,
      dto,
      user,
    );
  }

  @Post('batch/:batchId/material-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER, RoleName.WAREHOUSE_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liên kết lô nguyên liệu đầu vào với lô đầu ra' })
  linkBatchMaterial(
    @Param('batchId', ParseUUIDPipe) outputBatchId: string,
    @Body() dto: LinkBatchMaterialDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.traceabilityMasterDataService.linkInputMaterial(
      outputBatchId,
      dto,
      user,
    );
  }

  // ── Stages (lookup) ───────────────────────────────────────────────────────

  @Get('stages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách tất cả công đoạn chuỗi cung ứng' })
  async getStages() {
    return this.supplyChainService.getStages();
  }

  @Get('locations/suggest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gợi ý địa điểm và tọa độ cho công đoạn chuỗi cung ứng',
  })
  async suggestLocations(@Query('q') q: string) {
    return this.supplyChainService.suggestLocations(q || '');
  }

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thống kê tổng quan Supply Chain Dashboard' })
  async getDashboardStats(@CurrentUser() user: RequestUser) {
    return this.supplyChainService.getDashboardStats(user);
  }

  @Get('batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách đầy đủ lô hàng phục vụ truy xuất' })
  async getBatches(@CurrentUser() user: RequestUser) {
    return this.supplyChainService.getBatches(user);
  }

  @Post('batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Seller khai báo hồ sơ lô DRAFT, chưa làm tăng tồn kho',
  })
  createProductionBatch(
    @Body() dto: CreateProductionBatchDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supplyChainService.createProductionBatch(dto, user);
  }

  @Post('batch/:batchId/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Seller gửi hồ sơ lô đã đủ nguồn gốc và công đoạn sản xuất',
  })
  submitProductionBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: IdempotentLotActionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supplyChainService.submitProductionBatch(batchId, dto, user);
  }

  @Post('batch/:batchId/receive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.WAREHOUSE_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Warehouse Manager tiếp nhận vật lý và đưa lô vào cách ly',
  })
  receiveProductionBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: ReceiveProductionBatchDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.supplyChainService.receiveProductionBatch(
      batchId,
      dto,
      user,
      this.getIp(req),
    );
  }

  @Post('batch/:batchId/inspect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.QUALITY_ASSURANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'QA/QC độc lập kiểm định lô đang cách ly' })
  inspectProductionBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: InspectProductionBatchDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.supplyChainService.inspectProductionBatch(
      batchId,
      dto,
      user,
      this.getIp(req),
    );
  }

  @Post('batch/:batchId/put-away')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.WAREHOUSE_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Warehouse Manager xác nhận đưa lô đạt QC vào vị trí lưu trữ',
  })
  putAwayProductionBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: PutAwayProductionBatchDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.supplyChainService.putAwayProductionBatch(
      batchId,
      dto,
      user,
      this.getIp(req),
    );
  }

  @Post('batch/:batchId/release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.QUALITY_ASSURANCE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'QA phát hành lô đạt chuẩn để được phép bán/reserve',
  })
  releaseProductionBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: IdempotentLotActionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.supplyChainService.releaseProductionBatch(batchId, dto, user);
  }

  // ── History ───────────────────────────────────────────────────────────────

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
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
  @ApiResponse({
    status: 200,
    description: 'Thông tin product + batches + journeys',
  })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại' })
  async getProductSupplyChain(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.supplyChainService.getProductSupplyChain(productId);
  }

  // ── Batch Journey ─────────────────────────────────────────────────────────

  @Get('batch/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
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
  @Roles(RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ghi công đoạn theo vai trò nghiệp vụ (Admin chỉ giám sát)',
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

  private getIp(req: Request) {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined
    );
  }
}
