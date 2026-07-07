import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto';
import { ProductStatus } from '@prisma/client';

export class GetProductsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Lọc sản phẩm theo ngành hàng' })
  @IsUUID('4', { message: 'categoryId phải là định dạng UUID v4' })
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Lọc sản phẩm theo tỉnh/thành phố sản xuất' })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  @IsOptional()
  provinceId?: string;

  @ApiPropertyOptional({ description: 'Lọc sản phẩm theo phân cấp sao OCOP' })
  @IsUUID('4', { message: 'ocopLevelId phải là định dạng UUID v4' })
  @IsOptional()
  ocopLevelId?: string;

  @ApiPropertyOptional({ enum: ProductStatus, description: 'Lọc theo trạng thái duyệt sản phẩm' })
  @IsEnum(ProductStatus, { message: 'Trạng thái duyệt không hợp lệ' })
  @IsOptional()
  status?: ProductStatus;
}
