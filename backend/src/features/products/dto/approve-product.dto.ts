import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class ApproveProductDto {
  @ApiProperty({
    enum: [ProductStatus.APPROVED, ProductStatus.REJECTED],
    example: ProductStatus.APPROVED,
    description: 'Trạng thái phê duyệt mới',
  })
  @IsEnum([ProductStatus.APPROVED, ProductStatus.REJECTED], {
    message: 'Trạng thái phê duyệt phải là APPROVED hoặc REJECTED',
  })
  @IsNotEmpty({ message: 'Trạng thái phê duyệt không được trống' })
  status: ProductStatus;

  @ApiPropertyOptional({
    example:
      'Sản phẩm chưa đạt chứng nhận OCOP 3 sao do thiếu hồ sơ kiểm nghiệm.',
    description: 'Lý do từ chối kiểm duyệt (Bắt buộc khi REJECTED)',
  })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự' })
  @IsOptional()
  reason?: string;
}
