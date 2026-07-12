import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationCampaignsService } from './notification-campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';

@ApiTags('Notification Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notification-campaigns')
export class NotificationCampaignsController {
  constructor(private readonly notificationCampaignsService: NotificationCampaignsService) {}

  @Post()
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Tạo chiến dịch thông báo mới' })
  create(@Body() createCampaignDto: CreateCampaignDto, @CurrentUser() user: RequestUser) {
    return this.notificationCampaignsService.create(createCampaignDto, user);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Lấy danh sách chiến dịch' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.notificationCampaignsService.findAll(Number(page) || 1, Number(limit) || 10);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Lấy chi tiết chiến dịch' })
  findOne(@Param('id') id: string) {
    return this.notificationCampaignsService.findOne(id);
  }

  @Patch(':id/cancel')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Hủy chiến dịch' })
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notificationCampaignsService.cancel(id, user);
  }
}
