import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsBoolean, IsDateString, Min } from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateVoucherDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(DiscountType)
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsNumber()
  @Min(0)
  minOrderValue: number;

  @IsNumber()
  @IsOptional()
  maxDiscount?: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @IsOptional()
  usageLimit?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ApplyVoucherDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  businessId: string;

  @IsNumber()
  @Min(0)
  orderValue: number;
}
