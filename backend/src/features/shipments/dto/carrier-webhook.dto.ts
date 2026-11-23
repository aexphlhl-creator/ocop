import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CarrierWebhookDto {
  @ApiProperty({ description: 'ID sự kiện duy nhất từ nhà vận chuyển' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalEventId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  trackingCode: string;

  @ApiProperty({ enum: ShipmentEventType })
  @IsEnum(ShipmentEventType)
  eventType: ShipmentEventType;

  @ApiProperty()
  @IsISO8601()
  eventTime: string;

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
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  failureReason?: string;

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
