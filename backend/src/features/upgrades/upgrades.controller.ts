import { Controller, Post, Get, Patch, Body, Param, UseGuards, BadRequestException , ParseUUIDPipe} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UpgradesService } from './upgrades.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName, UpgradeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Upgrades')
@Controller('api/v1/upgrades')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UpgradesController {
  constructor(
    private readonly upgradesService: UpgradesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(RoleName.SELLER)
  @ApiOperation({ summary: 'Gửi yêu cầu nâng hạng sao OCOP' })
  async createRequest(
    @Body() dto: { productId: string; targetLevelId: string; reason: string; documentUrls: string[] },
    @CurrentUser() user: RequestUser
  ) {
    const business = await this.prisma.business.findFirst({ where: { userId: user.id } });
    if (!business) throw new BadRequestException('Bạn chưa có cửa hàng');
    
    return this.upgradesService.createRequest(
      business.id,
      dto.productId,
      dto.targetLevelId,
      dto.reason,
      dto.documentUrls || []
    );
  }

  @Get('seller')
  @Roles(RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu nâng hạng của tôi' })
  async getMyRequests(@CurrentUser() user: RequestUser) {
    const business = await this.prisma.business.findFirst({ where: { userId: user.id } });
    if (!business) throw new BadRequestException('Bạn chưa có cửa hàng');

    return this.upgradesService.getMyRequests(business.id);
  }

  @Get('admin')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách toàn bộ yêu cầu nâng hạng' })
  async getAllRequests() {
    return this.upgradesService.getAllRequests();
  }

  @Patch(':id/status')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Phê duyệt / Từ chối yêu cầu nâng hạng' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { status: UpgradeStatus; adminComment?: string }
  ) {
    return this.upgradesService.updateStatus(id, dto.status, dto.adminComment);
  }
}
