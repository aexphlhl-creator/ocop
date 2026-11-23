import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto';

export class GetWardsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 500,
    default: 100,
    description:
      'Số lượng bản ghi mỗi trang (tối đa 500 để tải trọn vẹn xã phường của tỉnh)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  override limit = 100;
  @ApiPropertyOptional({
    description: 'UUID của tỉnh/thành phố để lọc danh sách xã trực thuộc',
  })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  @IsOptional()
  provinceId?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm theo tên xã' })
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @IsOptional()
  search?: string;
}
