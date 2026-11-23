import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateSellerStatusDto {
  @ApiProperty({ description: 'Trạng thái hoạt động của tài khoản SELLER' })
  @IsBoolean()
  isActive: boolean;
}
