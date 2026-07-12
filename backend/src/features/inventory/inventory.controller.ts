import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
  ParseUUIDPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { StockAdjustDto } from './dto/stock-adjust.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import { GetInventoryQueryDto, GetMovementQueryDto } from './dto/get-inventory-query.dto';

@ApiTags('Inventory')
@Controller('api/v1/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ── Warehouses ─────────────────────────────────────────────────────────────

  @Post('warehouses')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Tạo kho mới' })
  async createWarehouse(@Body() dto: CreateWarehouseDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createWarehouse(dto, user);
  }

  @Get('warehouses')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Danh sách kho (Seller chỉ thấy kho của mình)' })
  async getWarehouses(@CurrentUser() user: RequestUser) {
    return this.inventoryService.getWarehouses(user);
  }

  @Delete('warehouses/:id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Xóa mềm kho (Soft Delete)' })
  async deleteWarehouse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.deleteWarehouse(id, user);
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────

  @Get('low-stock')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Danh sách sản phẩm tồn kho thấp (≤ ngưỡng cảnh báo)' })
  async getLowStock(@CurrentUser() user: RequestUser) {
    return this.inventoryService.getLowStock(user);
  }

  @Get('expiring')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Danh sách lô sắp hết hạn (mặc định trong 30 ngày tới)' })
  async getExpiring(
    @CurrentUser() user: RequestUser,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.inventoryService.getExpiring(days, user);
  }

  @Get('stats')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Thống kê tổng quan kho hàng' })
  async getStats(@CurrentUser() user: RequestUser) {
    return this.inventoryService.getStats(user);
  }

  // ── History ────────────────────────────────────────────────────────────────

  @Get('history')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lịch sử nhập/xuất kho (tất cả sản phẩm)' })
  async getHistory(@Query() query: GetMovementQueryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getMovementHistory(query, user);
  }

  // ── Stock Operations ───────────────────────────────────────────────────────

  @Post('in')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Nhập kho — Tự động sinh mã lô, ghi StockMovement(IN)' })
  @ApiResponse({ status: 201, description: 'Nhập kho thành công, trả về lô và movement' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Không có quyền nhập vào kho này' })
  async stockIn(@Body() dto: StockInDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.stockIn(dto, user);
  }

  @Post('out')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Xuất kho theo FIFO — Tự động trừ từ lô cũ nhất' })
  @ApiResponse({ status: 201, description: 'Xuất kho thành công' })
  @ApiResponse({ status: 400, description: 'Tồn kho không đủ' })
  async stockOut(@Body() dto: StockOutDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.stockOut(dto, user);
  }

  @Post('adjust')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Điều chỉnh kiểm kê (chỉ Admin)' })
  async stockAdjust(@Body() dto: StockAdjustDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.stockAdjust(dto, user);
  }

  @Post('transfer')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Chuyển hàng giữa các kho (cùng sản phẩm)' })
  async stockTransfer(@Body() dto: StockTransferDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.stockTransfer(dto, user);
  }

  // ── Inventory CRUD ─────────────────────────────────────────────────────────

  @Post()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Tạo bản ghi tồn kho cho sản phẩm trong kho' })
  async createInventory(@Body() dto: CreateInventoryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createInventory(dto, user);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Danh sách tồn kho (có phân trang, lọc)' })
  async getInventories(@Query() query: GetInventoryQueryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getInventories(query, user);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Chi tiết tồn kho 1 sản phẩm (kèm danh sách lô active)' })
  async getInventoryById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getInventoryById(id, user);
  }

  @Get(':id/batches')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Danh sách lô hàng của 1 sản phẩm trong kho' })
  async getBatches(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.getBatches(id, user);
  }

  @Get(':id/history')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lịch sử nhập/xuất của 1 bản ghi tồn kho cụ thể' })
  async getInventoryHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetMovementQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.getMovementHistory(query, user, id);
  }

  @Patch(':id/minimum')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Cập nhật ngưỡng tồn kho tối thiểu (để cảnh báo)' })
  async updateMinimum(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('minimumQuantity', ParseIntPipe) minimumQuantity: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateMinimumQuantity(id, minimumQuantity, user);
  }
}
