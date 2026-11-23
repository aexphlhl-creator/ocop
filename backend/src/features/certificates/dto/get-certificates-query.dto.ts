import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GetCertificatesQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Loại chứng nhận' })
  @IsString()
  @IsOptional()
  certificateTypeId?: string;

  @ApiPropertyOptional({ enum: CertificateStatus })
  @IsEnum(CertificateStatus)
  @IsOptional()
  status?: CertificateStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Hết hạn từ ngày ISO' })
  @IsString()
  @IsOptional()
  expiryFrom?: string;

  @ApiPropertyOptional({ description: 'Hết hạn đến ngày ISO' })
  @IsString()
  @IsOptional()
  expiryTo?: string;

  @ApiPropertyOptional({
    description: 'Tìm theo mã chứng nhận hoặc tổ chức cấp',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
