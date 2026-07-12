import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupplierService } from '../services/supplier.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/supplier.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequestUser } from '../../auth/interfaces/jwt-payload.interface';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';

@ApiTags('Suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Tạo nhà cung cấp mới' })
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.supplierService.createSupplier(createSupplierDto);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy danh sách nhà cung cấp' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.supplierService.getSuppliers({ page, limit, search }, user);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Lấy thông tin nhà cung cấp' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.supplierService.getSupplierById(id, user);
  }

  @Put(':id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Cập nhật nhà cung cấp' })
  update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser() user: RequestUser
  ) {
    return this.supplierService.updateSupplier(id, updateSupplierDto, user);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiOperation({ summary: 'Xóa (vô hiệu hóa) nhà cung cấp' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.supplierService.deleteSupplier(id, user);
  }
}
