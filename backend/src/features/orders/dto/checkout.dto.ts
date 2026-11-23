import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CheckoutItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

export class ShopVoucherDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  sellerId: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  code: string;
}

export class CheckoutDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Khóa idempotency do client tạo và giữ nguyên khi retry request',
  })
  @IsUUID('4')
  idempotencyKey: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  shippingAddress: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  @Matches(/^\+?[0-9\s.-]{8,20}$/)
  phone: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformVoucherCode?: string;

  @ApiPropertyOptional({ type: [ShopVoucherDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopVoucherDto)
  shopVouchers?: ShopVoucherDto[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
