import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { ApproveProductDto } from './dto/approve-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { PaginationDto } from '../../common/pagination/pagination.dto';
import { RoleName } from '@prisma/client';

@ApiTags('Products')
@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo sản phẩm OCOP mới (Chỉ dành cho SELLER hoặc ADMIN)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Tạo sản phẩm thành công, trả về sản phẩm vừa tạo. Seller tạo luôn ở trạng thái PENDING.',
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({
    status: 401,
    description: 'Không có quyền truy cập / Hết hạn đăng nhập',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền sở hữu chủ thể sản xuất',
  })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.create(dto, user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Lấy danh sách sản phẩm OCOP (Công cộng, có phân trang, bộ lọc nâng cao, và RBAC)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Danh sách sản phẩm kèm metadata phân trang. Visitor chỉ thấy APPROVED. Seller thấy thêm đồ của mình.',
  })
  async findAll(
    @Query() query: GetProductsQueryDto,
    @CurrentUser() user: RequestUser | null,
  ) {
    return this.productsService.findAll(query, user);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách sản phẩm thuộc sở hữu của Seller hiện tại',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách sản phẩm cá nhân kèm phân trang',
  })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Tài khoản không phải SELLER' })
  async findMy(
    @Query() query: PaginationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.findMyProducts(user, query.page, query.limit);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một sản phẩm OCOP theo ID hoặc Slug',
  })
  @ApiResponse({ status: 200, description: 'Thông tin chi tiết của sản phẩm' })
  @ApiResponse({
    status: 404,
    description: 'Sản phẩm không tồn tại hoặc đã bị xóa',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | null,
  ) {
    return this.productsService.findOne(id, user);
  }

  @Patch(':id/view')
  @ApiOperation({ summary: 'Tăng số lượt xem của sản phẩm' })
  @ApiResponse({ status: 200, description: 'Thành công' })
  async incrementView(@Param('id') id: string) {
    return this.productsService.incrementViewCount(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật thông tin sản phẩm OCOP (Chủ sản phẩm hoặc ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Cập nhật thành công. Seller sửa sản phẩm sẽ reset trạng thái về PENDING.',
  })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không sở hữu sản phẩm này' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Phê duyệt hoặc từ chối kiểm duyệt sản phẩm OCOP (Chỉ dành cho ADMIN)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Thay đổi trạng thái duyệt thành công và ghi nhận lịch sử kiểm duyệt',
  })
  @ApiResponse({ status: 400, description: 'Thiếu lý do từ chối khi REJECTED' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không phải tài khoản ADMIN' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.approve(id, dto, user);
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
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.remove(id, user);
  }
}
