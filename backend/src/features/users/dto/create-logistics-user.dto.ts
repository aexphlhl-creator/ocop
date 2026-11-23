import { CreateWarehouseManagerDto } from './create-warehouse-manager.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateLogisticsUserDto extends CreateWarehouseManagerDto {
  @ApiProperty({ description: 'Đơn vị vận chuyển mà tài khoản trực thuộc' })
  @IsUUID()
  organizationId: string;
}
