import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
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
  MinLength,
} from 'class-validator';
import { QualityStatus } from '@prisma/client';

export class IdempotentLotActionDto {
  @ApiProperty({
    description: 'Khóa chống gửi trùng của thao tác',
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey: string;

  @ApiPropertyOptional({ description: 'Thời điểm nghiệp vụ thực tế' })
  @IsOptional()
  @IsDateString()
  eventTime?: string;

  @ApiPropertyOptional({ description: 'Địa điểm thực hiện' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ vị trí thực hiện' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ vị trí thực hiện' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'Ghi chú nghiệp vụ' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @ApiPropertyOptional({ description: 'Mã chứng từ/biên bản tham chiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referenceCode?: string;

  @ApiPropertyOptional({ type: [String], description: 'Ảnh minh chứng' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Tài liệu minh chứng' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  attachmentUrls?: string[];
}

export class CreateProductionBatchDto {
  @ApiProperty({ description: 'Khóa chống tạo lô trùng từ client' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey: string;

  @ApiProperty({ description: 'Inventory đích thuộc Seller khai báo lô' })
  @IsUUID('4')
  inventoryId: string;

  @ApiPropertyOptional({
    description: 'Mã lô của Seller; bỏ trống để hệ thống sinh',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, {
    message:
      'Mã lô chỉ được chứa chữ, số, dấu chấm, gạch ngang, gạch dưới hoặc /',
  })
  batchNumber?: string;

  @ApiProperty({ example: 100, description: 'Số lượng Seller khai báo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declaredQuantity: number;

  @ApiPropertyOptional({ description: 'Tên nguồn cung cấp/người sản xuất' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  supplier?: string;

  @ApiPropertyOptional({ description: 'Ngày thu hoạch' })
  @IsOptional()
  @IsDateString()
  harvestDate?: string;

  @ApiPropertyOptional({ description: 'Ngày sản xuất' })
  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @ApiPropertyOptional({ description: 'Hạn sử dụng' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Vị trí dự kiến trong kho' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  warehouseLocation?: string;
}

export class ReceiveProductionBatchDto extends IdempotentLotActionDto {
  @ApiProperty({
    example: 98,
    description: 'Số lượng thực tế Warehouse Manager tiếp nhận',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  receivedQuantity: number;
}

export class InspectProductionBatchDto extends IdempotentLotActionDto {
  @ApiProperty({
    enum: QualityStatus,
    description: 'Chỉ nhận PASSED hoặc FAILED',
  })
  @IsEnum(QualityStatus)
  qualityStatus: QualityStatus;
}

export class PutAwayProductionBatchDto extends IdempotentLotActionDto {
  @ApiProperty({ description: 'Vị trí lưu trữ thực tế trong kho' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  warehouseLocation: string;
}
