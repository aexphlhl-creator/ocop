import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LogisticsOrganizationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLogisticsOrganizationDto {
  @ApiProperty({ example: 'GHN' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,50}$/)
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: LogisticsOrganizationType })
  @IsEnum(LogisticsOrganizationType)
  type: LogisticsOrganizationType;

  @ApiPropertyOptional({
    description: 'Mã adapter tích hợp của nhà vận chuyển',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,50}$/)
  providerCode?: string;

  @ApiPropertyOptional({
    description:
      'Mẫu URL tracking ngoài hãng, dùng {trackingCode} làm placeholder',
    example: 'https://tracking.example.com/orders/{trackingCode}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrlTemplate?: string;
}

export class UpdateLogisticsOrganizationDto extends PartialType(
  CreateLogisticsOrganizationDto,
) {
  @ApiPropertyOptional({
    description: 'Bật/tắt hãng vận chuyển khỏi danh sách tạo vận đơn',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
