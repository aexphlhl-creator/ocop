import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateCertificateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  certificateNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  certificateTypeId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  batchId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  issuingOrganization: string;

  @ApiProperty({ description: 'ISO date' })
  @IsString()
  @IsNotEmpty()
  issueDate: string;

  @ApiProperty({ description: 'ISO date' })
  @IsString()
  @IsNotEmpty()
  expiryDate: string;

  @ApiPropertyOptional({ enum: CertificateStatus })
  @IsEnum(CertificateStatus)
  @IsOptional()
  status?: CertificateStatus;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  verificationUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
