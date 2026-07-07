import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto';

export class GetWardsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'UUID của tỉnh/thành phố để lọc danh sách xã trực thuộc' })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  @IsOptional()
  provinceId?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm theo tên xã' })
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @IsOptional()
  search?: string;
}
