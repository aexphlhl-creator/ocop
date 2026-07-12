import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { WarehouseType } from '@prisma/client';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Kho HTX Mật Ong Khánh Hòa', description: 'Tên kho' })
  @IsString()
  @IsNotEmpty({ message: 'Tên kho không được trống' })
  name: string;

  @ApiProperty({ example: '123 Nguyễn Văn Linh, Đà Nẵng', description: 'Địa chỉ kho' })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: '123 Nguyễn Văn Linh, Hải Châu, Đà Nẵng, Việt Nam', description: 'Địa chỉ chuẩn hóa từ Geocoding' })
  @IsString()
  @IsOptional()
  formattedAddress?: string;

  @ApiPropertyOptional({ example: 'Kho bảo quản mát, nhiệt độ 18-22°C', description: 'Mô tả kho' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: WarehouseType, description: 'Loại kho' })
  @IsEnum(WarehouseType)
  @IsOptional()
  type?: WarehouseType;

  @ApiPropertyOptional({ description: 'UUID người quản lý kho' })
  @IsUUID('4')
  @IsOptional()
  managerId?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ (Latitude)' })
  @IsNumber()
  @Min(-90, { message: 'Vĩ độ phải từ -90 đến 90' })
  @Max(90, { message: 'Vĩ độ phải từ -90 đến 90' })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ (Longitude)' })
  @IsNumber()
  @Min(-180, { message: 'Kinh độ phải từ -180 đến 180' })
  @Max(180, { message: 'Kinh độ phải từ -180 đến 180' })
  @IsOptional()
  longitude?: number;
}
