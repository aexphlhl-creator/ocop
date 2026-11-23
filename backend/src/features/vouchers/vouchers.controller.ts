import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto, ApplyVoucherDto } from './dto/voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@ApiTags('Vouchers')
@Controller('api/v1/vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo mã giảm giá' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  async create(
    @Body() dto: CreateVoucherDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vouchersService.create(dto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách mã giảm giá' })
  async getAll(@CurrentUser() user: RequestUser) {
    return this.vouchersService.getAll(user);
  }

  @Post('apply')
  @HttpCode(200)
  @ApiOperation({ summary: 'Kiểm tra và tính toán mã giảm giá' })
  async apply(@Body() dto: ApplyVoucherDto) {
    return this.vouchersService.apply(dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa mã giảm giá' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vouchersService.delete(id, user);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bật hoặc tắt trạng thái hoạt động của mã giảm giá',
  })
  async toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vouchersService.toggleStatus(id, user);
  }
}
