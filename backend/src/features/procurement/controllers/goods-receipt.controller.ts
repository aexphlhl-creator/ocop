import { Controller, Get, Post, Body, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { ReceiveGoodsDto } from '../dto/goods-receipt.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';

@ApiTags('Goods Receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goods-receipts')
export class GoodsReceiptController {
  constructor(private readonly goodsReceiptService: GoodsReceiptService) {}

  @Post()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Nhập kho từ đơn mua hàng' })
  receiveGoods(@Body() dto: ReceiveGoodsDto, @CurrentUser() user: RequestUser) {
    return this.goodsReceiptService.receiveGoods(dto, user);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy danh sách phiếu nhập kho' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.goodsReceiptService.getGoodsReceipts({ page, limit, search }, user);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy chi tiết phiếu nhập kho' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.goodsReceiptService.getGoodsReceiptById(id, user);
  }
}
