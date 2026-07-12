import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QualityStatusEnum } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiveGoodsItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty()
  @IsNumber()
  rejectedQuantity: number;

  @ApiProperty()
  @IsNumber()
  damagedQuantity: number;

  @ApiProperty({ enum: QualityStatusEnum, required: false })
  @IsOptional()
  @IsEnum(QualityStatusEnum)
  qualityStatus?: QualityStatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class ReceiveGoodsDto {
  @ApiProperty()
  @IsString()
  purchaseOrderId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ReceiveGoodsItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveGoodsItemDto)
  items: ReceiveGoodsItemDto[];
}
