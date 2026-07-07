import { Controller, Post, Get, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@ApiTags('Products')
@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo sản phẩm OCOP mới (Chỉ dành cho SELLER hoặc ADMIN)' })
  @ApiResponse({ status: 201, description: 'Tạo sản phẩm thành công, trả về sản phẩm vừa tạo. Seller tạo luôn ở trạng thái PENDING.' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Không có quyền truy cập / Hết hạn đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không có quyền sở hữu chủ thể sản xuất' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.productsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm OCOP (Công cộng, có phân trang và bộ lọc)' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm kèm metadata phân trang' })
  async findAll(@Query() query: GetProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một sản phẩm OCOP theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết của sản phẩm kèm hình ảnh, ngành hàng, và chủ thể sản xuất' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại hoặc đã bị xóa' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin sản phẩm OCOP (Chủ sản phẩm hoặc ADMIN)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công. Seller sửa sản phẩm sẽ reset trạng thái về PENDING.' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không sở hữu sản phẩm này' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa mềm sản phẩm OCOP (Chủ sản phẩm hoặc ADMIN)' })
  @ApiResponse({ status: 200, description: 'Xóa sản phẩm thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không sở hữu sản phẩm này' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại' })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.productsService.remove(id, user);
  }
}
