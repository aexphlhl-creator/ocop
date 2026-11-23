import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateInventoryDto {
  @ApiProperty({ description: 'UUID kho' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'UUID sản phẩm' })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Ngưỡng tồn kho tối thiểu để cảnh báo',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  minimumQuantity?: number;
}
