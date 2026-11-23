import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class VersionedShipmentActionDto {
  @ApiProperty({ description: 'Version hiện tại để chống cập nhật đè' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiProperty({ description: 'Khóa chống xử lý trùng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;
}

export class AssignShipmentDto extends VersionedShipmentActionDto {
  @ApiProperty()
  @IsUUID()
  logisticsUserId: string;

  @ApiPropertyOptional({ description: 'Đổi đơn vị vận chuyển khi gán lại' })
  @IsOptional()
  @IsUUID()
  carrierOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Mã vận đơn mới khi đổi đơn vị' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trackingCode?: string;

  @ApiPropertyOptional({
    description: 'Bắt buộc khi thay người đang được giao',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ShipmentEvidenceDto extends VersionedShipmentActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  location: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  eventTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true }, { each: true })
  attachmentUrls?: string[];
}

export class HandoverShipmentDto extends ShipmentEvidenceDto {}

export class TransitionShipmentDto extends ShipmentEvidenceDto {
  @ApiProperty({ enum: ShipmentEventType })
  @IsEnum(ShipmentEventType)
  eventType: ShipmentEventType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  failureReason?: string;
}

export class CancelShipmentDto extends VersionedShipmentActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}
