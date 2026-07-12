import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class StockAdjustDto {
  @ApiProperty({ description: 'UUID Inventory' })
  @IsUUID('4')
  @IsNotEmpty()
  inventoryId: string;

  @ApiProperty({ example: 95, description: 'Số lượng thực tế sau kiểm kê (tuyệt đối, không phải delta)' })
  @IsInt()
  @IsNotEmpty()
  newQuantity: number;

  @ApiProperty({ example: 'Kiểm kê định kỳ tháng 7/2026', description: 'Lý do điều chỉnh' })
  @IsString()
  @IsNotEmpty({ message: 'Lý do điều chỉnh là bắt buộc' })
  reason: string;

  @ApiPropertyOptional({ example: 'Phát hiện 5 chai bị vỡ do vận chuyển', description: 'Ghi chú thêm' })
  @IsString()
  @IsOptional()
  note?: string;
}
