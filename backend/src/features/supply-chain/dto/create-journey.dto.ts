import { IsString, IsOptional, IsNumber, IsArray, IsUUID, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateJourneyDto {
  @ApiProperty({ description: 'ID của công đoạn chuỗi cung ứng (SupplyChainStage)' })
  @IsUUID()
  stageId: string;

  @ApiProperty({ description: 'Tên địa điểm thực hiện công đoạn' })
  @IsString()
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
  actorName: string;

  @ApiPropertyOptional({ description: 'ID user nội bộ thực hiện (nếu có)' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú, mô tả công đoạn' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Danh sách URL ảnh minh chứng', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Danh sách URL tài liệu đính kèm', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}
