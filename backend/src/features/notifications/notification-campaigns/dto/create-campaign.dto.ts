import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { NotificationTarget } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  eventId?: string;

  @ApiProperty({ enum: NotificationTarget })
  @IsEnum(NotificationTarget)
  @IsNotEmpty()
  targetAudience: NotificationTarget;

  @ApiProperty({ required: false })
  @IsOptional()
  targetDetails?: any;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
