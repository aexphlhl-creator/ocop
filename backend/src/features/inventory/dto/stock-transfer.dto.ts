import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class StockTransferDto {
  @ApiProperty({ description: 'Khóa chống gửi trùng, do client tạo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, {
    message: 'Khóa chống gửi trùng không được chỉ chứa khoảng trắng',
  })
  idempotencyKey: string;

  @ApiProperty({ description: 'UUID Inventory nguồn (kho xuất)' })
  @IsUUID('4')
  @IsNotEmpty()
  fromInventoryId: string;

  @ApiProperty({
    description: 'UUID Inventory đích (kho nhận). Phải cùng productId.',
  })
  @IsUUID('4')
  @IsNotEmpty()
  toInventoryId: string;

  @ApiProperty({ example: 30, description: 'Số lượng cần chuyển' })
  @IsInt()
  @Min(1, { message: 'Số lượng chuyển phải lớn hơn 0' })
  quantity: number;

  @ApiPropertyOptional({
    example: 'Điều phối hàng từ kho Hà Nội sang kho Hải Phòng',
    description: 'Lý do chuyển kho',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsString()
  @IsOptional()
  note?: string;
}
