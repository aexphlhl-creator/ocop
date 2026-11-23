import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ArrayMaxSize,
  IsUUID,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  MaxLength,
  IsUrl,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QualityStatus } from '@prisma/client';

export class CreateJourneyDto {
  @ApiProperty({
    description: 'ID của công đoạn chuỗi cung ứng (SupplyChainStage)',
  })
  @IsUUID()
  stageId: string;

  @ApiProperty({ description: 'Tên địa điểm thực hiện công đoạn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  location: string;

  @ApiPropertyOptional({ description: 'Vĩ độ' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({ description: 'Tên người/đơn vị thực hiện công đoạn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  actorName: string;

  @ApiPropertyOptional({ description: 'ID user nội bộ thực hiện (nếu có)' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú, mô tả công đoạn' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm công đoạn thực tế; mặc định là thời điểm ghi nhận',
    example: '2026-08-21T09:30:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  eventTime?: string;

  @ApiPropertyOptional({
    enum: QualityStatus,
    description: 'Kết quả kiểm định; bắt buộc với QUALITY_INSPECTION',
  })
  @IsOptional()
  @IsEnum(QualityStatus)
  qualityStatus?: QualityStatus;

  @ApiPropertyOptional({
    description:
      'Nhân viên logistics được Warehouse Manager chỉ định khi bàn giao',
  })
  @IsOptional()
  @IsUUID()
  logisticsUserId?: string;

  @ApiPropertyOptional({
    description: 'Mã vận đơn hoặc mã biên bản giao nhận',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referenceCode?: string;

  @ApiPropertyOptional({ description: 'Đơn vị vận chuyển' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  carrierName?: string;

  @ApiPropertyOptional({ description: 'Người nhận hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({
    description: 'Danh sách URL ảnh minh chứng',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'Danh sách URL tài liệu đính kèm',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsUrl({ require_protocol: true, require_tld: false }, { each: true })
  attachmentUrls?: string[];
}
