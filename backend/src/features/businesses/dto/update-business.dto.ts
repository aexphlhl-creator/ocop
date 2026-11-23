import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateBusinessDto } from './create-business.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Trạng thái xác thực chủ thể (Chỉ dành cho ADMIN)',
  })
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;
}
