import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsNumber, Min, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class OrderItemDto {
  @ApiProperty({ description: 'ID sản phẩm' })
  @IsUUID('4', { message: 'productId phải là định dạng UUID' })
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Số lượng mua' })
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'ID của Doanh nghiệp / Chủ thể' })
  @IsUUID('4', { message: 'businessId phải là định dạng UUID' })
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ description: 'Địa chỉ giao hàng' })
  @IsString()
  @IsNotEmpty()
  shippingAddress: string;

  @ApiProperty({ description: 'Số điện thoại liên hệ' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Phương thức thanh toán', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ type: [OrderItemDto], description: 'Danh sách sản phẩm' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ description: 'Mã giảm giá sàn', required: false })
  @IsString()
  @IsOptional()
  platformVoucherCode?: string;

  @ApiProperty({ description: 'Mã giảm giá shop', required: false })
  @IsString()
  @IsOptional()
  shopVoucherCode?: string;
}
