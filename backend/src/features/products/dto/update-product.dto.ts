import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { ProductStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ enum: ProductStatus, description: 'Trạng thái kiểm duyệt sản phẩm (Chỉ dành cho ADMIN)' })
  @IsEnum(ProductStatus, { message: 'Trạng thái duyệt không hợp lệ' })
  @IsOptional()
  status?: ProductStatus;
}
