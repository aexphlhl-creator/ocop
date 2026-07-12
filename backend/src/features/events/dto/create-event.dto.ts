import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsDateString, IsEnum, Min } from 'class-validator';
import { EventStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  banner?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  registrationDeadline?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  organizer?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  eventType?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  registrationRequired?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxParticipants?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  contactEmail?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiProperty({ required: false, enum: EventStatus })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;
}
