import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateWarehouseDto } from './create-warehouse.dto';

export class UpdateWarehouseDto extends PartialType(
  OmitType(CreateWarehouseDto, ['managerId'] as const),
) {
  @ApiPropertyOptional({
    description: 'UUID người quản lý kho; gửi null để bỏ gán',
    nullable: true,
  })
  @IsUUID('4')
  @IsOptional()
  managerId?: string | null;
}
