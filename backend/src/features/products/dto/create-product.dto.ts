import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Bột cacao nguyên chất Cầu Đất', description: 'Tên sản phẩm OCOP' })
  @IsString()
  @IsNotEmpty({ message: 'Tên sản phẩm không được trống' })
  name: string;

  @ApiProperty({ example: 'Sản phẩm bột cacao hữu cơ chất lượng cao trồng tại Lâm Đồng...', description: 'Mô tả chi tiết sản phẩm' })
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

  @ApiProperty({ example: '68c76d3a-1200-4b67-acd7-50af659a6f41', description: 'UUID phân cấp sao OCOP' })
  @IsUUID('4', { message: 'ocopLevelId phải là định dạng UUID v4' })
  ocopLevelId: string;

  @ApiProperty({ example: '2f6b5503-6ff6-4164-9809-b84c680fdd63', description: 'UUID của ngành hàng' })
  @IsUUID('4', { message: 'categoryId phải là định dạng UUID v4' })
  categoryId: string;

  @ApiProperty({ example: '7d2175d1-1200-4da1-8f9d-ce8efb208bd5', description: 'UUID của doanh nghiệp/chủ thể sản xuất' })
  @IsUUID('4', { message: 'businessId phải là định dạng UUID v4' })
  businessId: string;

  @ApiProperty({ example: 'cb1eaa04-6b43-4420-a717-444360966d15', description: 'UUID của tỉnh/thành phố sản xuất' })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  provinceId: string;

  @ApiProperty({ example: 'd6adcf9f-3815-427e-90e0-07bf97098854', description: 'UUID của xã/phường sản xuất trực thuộc' })
  @IsUUID('4', { message: 'wardId phải là định dạng UUID v4' })
  wardId: string;

  @ApiProperty({ example: 11.9404, description: 'Tọa độ vĩ độ của điểm hiển thị sản phẩm' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 108.4583, description: 'Tọa độ kinh độ của điểm hiển thị sản phẩm' })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ example: 'https://youtube.com/watch?v=example', description: 'Đường dẫn video giới thiệu sản phẩm' })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional({ example: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e'], description: 'Danh sách các URL ảnh giới thiệu sản phẩm' })
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];
}
