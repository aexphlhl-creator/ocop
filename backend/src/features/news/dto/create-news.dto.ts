import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { NewsStatus } from '@prisma/client';

export class CreateNewsDto {
  @ApiProperty({
    example: 'Khởi động chương trình OCOP Việt Nam năm 2026',
    description: 'Tiêu đề bài viết tin tức',
  })
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  title: string;

  @ApiProperty({
    example: 'Nội dung bài viết chi tiết...',
    description: 'Nội dung bài viết dạng văn bản hoặc HTML',
  })
  @IsString({ message: 'Nội dung phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  content: string;

  @ApiProperty({
    example: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836',
    description: 'URL hình ảnh đại diện bài viết',
  })
  @IsString({ message: 'Đường dẫn ảnh đại diện phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Đường dẫn ảnh đại diện không được để trống' })
  thumbnail: string;

  @ApiProperty({
    enum: NewsStatus,
    example: NewsStatus.DRAFT,
    description: 'Trạng thái bài viết',
  })
  @IsEnum(NewsStatus, {
    message: 'Trạng thái bài viết phải là DRAFT hoặc PUBLISHED',
  })
  @IsNotEmpty({ message: 'Trạng thái bài viết không được để trống' })
  status: NewsStatus;
}
