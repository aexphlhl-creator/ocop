import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto';
import { ProductStatus } from '@prisma/client';

export class GetProductsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo tên hoặc mô tả sản phẩm',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc sản phẩm theo ngành hàng' })
  @IsUUID('4', { message: 'categoryId phải là định dạng UUID v4' })
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Lọc sản phẩm theo tỉnh/thành phố sản xuất',
  })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  @IsOptional()
  provinceId?: string;

  @ApiPropertyOptional({
    description: 'Lọc sản phẩm theo xã/phường sản xuất trực thuộc',
  })
  @IsUUID('4', { message: 'wardId phải là định dạng UUID v4' })
  @IsOptional()
  wardId?: string;

  @ApiPropertyOptional({ description: 'Lọc sản phẩm theo tài khoản người bán' })
  @IsUUID('4', { message: 'sellerId phải là định dạng UUID v4' })
  @IsOptional()
  sellerId?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Bộ lọc Business legacy',
  })
  @IsUUID('4', { message: 'businessId phải là định dạng UUID v4' })
  @IsOptional()
  businessId?: string;

  @ApiPropertyOptional({ description: 'Lọc sản phẩm theo phân cấp sao OCOP' })
  @IsUUID('4', { message: 'ocopLevelId phải là định dạng UUID v4' })
  @IsOptional()
  ocopLevelId?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Lọc theo trạng thái duyệt sản phẩm',
  })
  @IsEnum(ProductStatus, { message: 'Trạng thái duyệt không hợp lệ' })
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ minimum: 0, description: 'Giá bán tối thiểu' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Giá trị minPrice phải lớn hơn hoặc bằng 0' })
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Giá bán tối đa' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Giá trị maxPrice phải lớn hơn hoặc bằng 0' })
  @IsOptional()
  maxPrice?: number;

  @ApiPropertyOptional({
    example: 'createdAt',
    description:
      'Trường dùng để sắp xếp dữ liệu (ví dụ: createdAt, price, name)',
  })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    example: 'desc',
    enum: ['asc', 'desc'],
    description: 'Chiều sắp xếp (tăng hoặc giảm dần)',
  })
  @IsEnum(['asc', 'desc'], { message: 'sortOrder phải là asc hoặc desc' })
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
