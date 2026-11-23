import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    example: 'Bột cacao nguyên chất Cầu Đất',
    description: 'Tên sản phẩm OCOP',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên sản phẩm không được trống' })
  name: string;

  @ApiProperty({
    example: 'Sản phẩm bột cacao hữu cơ chất lượng cao trồng tại Lâm Đồng...',
    description: 'Mô tả chi tiết sản phẩm',
  })
  @IsString()
  @IsNotEmpty({ message: 'Mô tả sản phẩm không được trống' })
  description: string;

  @ApiProperty({ example: 120000, description: 'Giá bán sản phẩm' })
  @IsNumber()
  @Min(0, { message: 'Giá sản phẩm phải lớn hơn hoặc bằng 0' })
  price: number;

  @ApiProperty({ example: 'Hộp 250g', description: 'Đơn vị tính' })
  @IsString()
  @IsNotEmpty({ message: 'Đơn vị tính không được trống' })
  unit: string;

  @ApiProperty({
    example: '68c76d3a-1200-4b67-acd7-50af659a6f41',
    description: 'UUID phân cấp sao OCOP',
  })
  @IsUUID('4', { message: 'ocopLevelId phải là định dạng UUID v4' })
  ocopLevelId: string;

  @ApiProperty({
    example: '2f6b5503-6ff6-4164-9809-b84c680fdd63',
    description: 'UUID của ngành hàng',
  })
  @IsUUID('4', { message: 'categoryId phải là định dạng UUID v4' })
  categoryId: string;

  @ApiPropertyOptional({
    example: '7d2175d1-1200-4da1-8f9d-ce8efb208bd5',
    description: 'UUID tài khoản SELLER; chỉ ADMIN cần truyền',
  })
  @IsUUID('4', { message: 'sellerId phải là định dạng UUID v4' })
  @IsOptional()
  sellerId?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Khóa Business legacy, chỉ được giữ để tương thích API cũ',
  })
  @IsUUID('4', { message: 'businessId phải là định dạng UUID v4' })
  @IsOptional()
  businessId?: string;

  @ApiProperty({
    example: 'cb1eaa04-6b43-4420-a717-444360966d15',
    description: 'UUID của tỉnh/thành phố sản xuất',
  })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  provinceId: string;

  @ApiProperty({
    example: 'd6adcf9f-3815-427e-90e0-07bf97098854',
    description: 'UUID của xã/phường sản xuất trực thuộc',
  })
  @IsUUID('4', { message: 'wardId phải là định dạng UUID v4' })
  wardId: string;

  @ApiProperty({
    example: 11.9404,
    description: 'Tọa độ vĩ độ của điểm hiển thị sản phẩm',
  })
  @IsNumber()
  latitude: number;

  @ApiProperty({
    example: 108.4583,
    description: 'Tọa độ kinh độ của điểm hiển thị sản phẩm',
  })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({
    example: 'https://youtube.com/watch?v=example',
    description: 'Đường dẫn video giới thiệu sản phẩm',
  })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional({
    example: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e'],
    description: 'Danh sách các URL ảnh giới thiệu sản phẩm',
  })
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  // Traceability Fields
  @ApiPropertyOptional({
    example: 'Vùng trồng tại Cam Lâm...',
    description: 'Mô tả nguồn gốc nguyên liệu',
  })
  @IsString()
  @IsOptional()
  originProcess?: string;

  @ApiPropertyOptional({
    example: 'Canh tác theo chuẩn VietGAP...',
    description: 'Mô tả quy trình chăm sóc / tiêu chuẩn',
  })
  @IsString()
  @IsOptional()
  farmingProcess?: string;

  @ApiPropertyOptional({
    example: 'Thu hoạch sáng sớm, sơ chế sạch...',
    description: 'Mô tả quy trình thu hoạch & sơ chế',
  })
  @IsString()
  @IsOptional()
  harvestProcess?: string;

  @ApiPropertyOptional({
    example: 'Đóng gói hút chân không...',
    description: 'Mô tả quy trình đóng gói',
  })
  @IsString()
  @IsOptional()
  packagingProcess?: string;

  @ApiPropertyOptional({
    example: 'VSATTP-01/2026',
    description: 'Số giấy phép VSATTP / OCOP',
  })
  @IsString()
  @IsOptional()
  certificateNumber?: string;

  @ApiPropertyOptional({
    example: '2026-07-08T00:00:00Z',
    description: 'Ngày thu hoạch / Sản xuất dự kiến',
  })
  @IsDateString(
    {},
    { message: 'harvestDate phải là định dạng ngày tháng hợp lệ' },
  )
  @IsOptional()
  harvestDate?: string;
}
