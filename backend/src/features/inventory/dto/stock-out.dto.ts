import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StockOutDto {
  @ApiProperty({ description: 'UUID Inventory' })
  @IsUUID('4')
  @IsNotEmpty()
  inventoryId: string;

  @ApiProperty({ example: 50, description: 'Số lượng xuất kho' })
  @IsInt()
  @Min(1, { message: 'Số lượng xuất phải lớn hơn 0' })
  quantity: number;

  @ApiPropertyOptional({ example: 'ORDER-1023', description: 'Mã đơn hàng tham chiếu' })
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({ example: 'ORDER', description: 'Loại tham chiếu (ORDER, TRANSFER,...)' })
  @IsString()
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional({ example: 'Xuất kho giao cho đại lý Hà Nội', description: 'Ghi chú' })
  @IsString()
  @IsOptional()
  note?: string;
}
