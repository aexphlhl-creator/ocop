import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class StockInDto {
  @ApiProperty({
    description:
      'UUID của bản ghi Inventory (warehouseId + productId đã được tạo sẵn)',
  })
  @IsUUID('4')
  @IsNotEmpty()
  inventoryId: string;

  @ApiProperty({ example: 100, description: 'Số lượng nhập kho' })
  @IsInt()
  @Min(1, { message: 'Số lượng nhập phải lớn hơn 0' })
  quantity: number;

  @ApiPropertyOptional({
    example: 'HTX Mật Ong Hoa Rừng',
    description: 'Tên nhà cung cấp / nông dân',
  })
  @IsString()
  @IsOptional()
  supplier?: string;

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Ngày thu hoạch' })
  @IsDateString()
  @IsOptional()
  harvestDate?: string;

  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Ngày sản xuất / chế biến',
  })
  @IsDateString()
  @IsOptional()
  manufactureDate?: string;

  @ApiPropertyOptional({
    example: '2027-07-01',
    description: 'Hạn sử dụng của lô',
  })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({
    example: 'Kệ A3 - Kho lạnh',
    description: 'Vị trí lưu trữ trong kho',
  })
  @IsString()
  @IsOptional()
  warehouseLocation?: string;

  @ApiPropertyOptional({
    example: 'PO-2026-001',
    description: 'Mã đơn mua hàng tham chiếu',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({
    example: 'Nhập hàng đầu vụ tháng 7',
    description: 'Ghi chú',
  })
  @IsString()
  @IsOptional()
  note?: string;
}
