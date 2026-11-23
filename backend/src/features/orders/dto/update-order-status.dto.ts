import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: 'Trạng thái đơn hàng mới' })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({
    description: 'Ghi chú / mô tả lý do thay đổi trạng thái',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
