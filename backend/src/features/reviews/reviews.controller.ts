import { Controller, Post, Get, Delete, Body, Param, UseGuards , ParseUUIDPipe} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RoleName } from '@prisma/client';

@ApiTags('Reviews')
@Controller('api/v1/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm mới đánh giá sản phẩm' })
  @ApiResponse({ status: 201, description: 'Đánh giá thành công' })
  async create(@Body() dto: CreateReviewDto, @CurrentUser() user: RequestUser) {
    return this.reviewsService.create(dto, user);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy tất cả đánh giá (Admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách tất cả đánh giá' })
  async getAllReviews() {
    return this.reviewsService.getAllReviews();
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Lấy danh sách đánh giá của sản phẩm' })
  @ApiResponse({ status: 200, description: 'Danh sách đánh giá' })
  async getByProductId(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.reviewsService.getByProductId(productId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa đánh giá (Admin)' })
  @ApiResponse({ status: 200, description: 'Xóa đánh giá thành công' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.delete(id);
  }
}
