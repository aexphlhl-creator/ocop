import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateLogisticsOrganizationDto,
  UpdateLogisticsOrganizationDto,
} from './dto/create-logistics-organization.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { QueryShipmentsDto } from './dto/query-shipments.dto';
import {
  CancelShipmentDto,
  HandoverShipmentDto,
} from './dto/shipment-actions.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('organizations')
  @Roles(RoleName.ADMIN, RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({ summary: 'Danh sách đơn vị vận chuyển đang hoạt động' })
  getOrganizations(
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shipmentsService.getOrganizations(
      includeInactive === 'true' && user.role === RoleName.ADMIN,
    );
  }

  @Post('organizations')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Tạo đơn vị vận chuyển (chỉ Admin)' })
  createOrganization(@Body() dto: CreateLogisticsOrganizationDto) {
    return this.shipmentsService.createOrganization(dto);
  }

  @Patch('organizations/:organizationId')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Cập nhật cấu hình hãng vận chuyển (chỉ Admin)' })
  updateOrganization(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateLogisticsOrganizationDto,
  ) {
    return this.shipmentsService.updateOrganization(organizationId, dto);
  }

  @Get('fulfillment-orders')
  @Roles(RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({
    summary:
      'Đơn đã đóng gói, đã giữ tồn và sẵn sàng tạo chuyến tại kho được giao quản lý',
  })
  getFulfillmentOrders(@CurrentUser() user: RequestUser) {
    return this.shipmentsService.getFulfillmentOrders(user);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({ summary: 'Danh sách chuyến hàng theo phạm vi vai trò' })
  list(@Query() query: QueryShipmentsDto, @CurrentUser() user: RequestUser) {
    return this.shipmentsService.list(query, user);
  }

  @Post()
  @Roles(RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({ summary: 'Tạo chuyến và phân bổ số lượng từ nhiều lô' })
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: RequestUser) {
    return this.shipmentsService.create(dto, user);
  }

  @Get(':shipmentId')
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({ summary: 'Chi tiết chuyến, carrier tracking và audit event' })
  getById(
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shipmentsService.getById(shipmentId, user);
  }

  @Post(':shipmentId/handover')
  @Roles(RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({
    summary: 'Warehouse Manager xác nhận bàn giao có minh chứng',
  })
  handover(
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @Body() dto: HandoverShipmentDto,
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
  ) {
    return this.shipmentsService.handover(
      shipmentId,
      dto,
      user,
      this.ipAddress(request),
    );
  }

  @Post(':shipmentId/cancel')
  @Roles(RoleName.WAREHOUSE_MANAGER)
  @ApiOperation({ summary: 'Hủy chuyến trước bàn giao, có lý do và audit' })
  cancel(
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @Body() dto: CancelShipmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.shipmentsService.cancel(shipmentId, dto, user);
  }

  private ipAddress(request: Request) {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      undefined
    );
  }
}
