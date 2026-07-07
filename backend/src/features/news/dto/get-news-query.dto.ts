import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto';
import { NewsStatus } from '@prisma/client';

export class GetNewsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm theo tiêu đề hoặc nội dung bài viết' })
  @IsString()
  @IsOptional()
  keyword?: string;

  @ApiPropertyOptional({ enum: NewsStatus, description: 'Lọc bài viết theo trạng thái (ADMIN được xem DRAFT)' })
  @IsEnum(NewsStatus, { message: 'Trạng thái bài viết phải là DRAFT hoặc PUBLISHED' })
  @IsOptional()
  status?: NewsStatus;
}
