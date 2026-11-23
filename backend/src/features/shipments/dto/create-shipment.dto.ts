import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentRouteType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateShipmentItemDto {
  @ApiProperty()
  @IsUUID()
  batchId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderItemId?: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateShipmentDto {
  @ApiProperty({ description: 'Khóa chống tạo trùng từ client' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;

  @ApiProperty()
  @IsUUID()
  originWarehouseId: string;

  @ApiProperty()
  @IsUUID()
  carrierOrganizationId: string;

  @ApiProperty({ enum: ShipmentRouteType })
  @IsEnum(ShipmentRouteType)
  routeType: ShipmentRouteType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiProperty({
    description:
      'Mã vận đơn do hãng vận chuyển cấp; hệ thống dùng mã này để nhận webhook/tracking',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  trackingCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destinationName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  destinationAddress: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  destinationPhone?: string;

  @ApiProperty({ type: [CreateShipmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items: CreateShipmentItemDto[];
}
