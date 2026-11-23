import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TraceabilityLocationType,
  TraceabilityPartyType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO31661Alpha2,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTraceabilityPartyDto {
  @ApiProperty({ example: 'HTX-MAT-ONG-001' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,100}$/)
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  name: string;

  @ApiProperty({ enum: TraceabilityPartyType })
  @IsEnum(TraceabilityPartyType)
  type: TraceabilityPartyType;

  @ApiPropertyOptional({ description: 'GS1 Global Location Number, 13 chữ số' })
  @IsOptional()
  @Matches(/^\d{13}$/)
  gln?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateTraceabilityLocationDto {
  @ApiProperty({ example: 'FARM-DL-001' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,100}$/)
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  name: string;

  @ApiProperty({ enum: TraceabilityLocationType })
  @IsEnum(TraceabilityLocationType)
  type: TraceabilityLocationType;

  @ApiPropertyOptional({ description: 'GS1 Global Location Number, 13 chữ số' })
  @IsOptional()
  @Matches(/^\d{13}$/)
  gln?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  ward?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  province?: string;

  @ApiPropertyOptional({ default: 'VN' })
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class VerifyTraceabilityPartyDto {
  @ApiProperty()
  @IsBoolean()
  verified: boolean;
}

export class DeclareBatchOriginDto {
  @ApiProperty()
  @IsUUID()
  partyId: string;

  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  sourceLotCode: string;

  @ApiPropertyOptional({ default: 'VN' })
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  harvestDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  manufactureDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  productionMethod?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  evidenceUrls?: string[];

  @ApiPropertyOptional({
    description: 'Bắt buộc từ lần khai báo hiệu chỉnh thứ hai',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;
}

export class LinkBatchMaterialDto {
  @ApiProperty()
  @IsUUID()
  inputBatchId: string;

  @ApiProperty({ minimum: 0.001 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unit: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  processReference: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  evidenceUrls?: string[];
}
