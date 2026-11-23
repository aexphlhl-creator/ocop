import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto';

export class GetBusinessesQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Từ khóa tìm kiếm theo tên chủ thể, mã số thuế, email, địa chỉ',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc chủ thể theo tỉnh/thành phố' })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  @IsOptional()
  provinceId?: string;

  @ApiPropertyOptional({ description: 'Lọc chủ thể theo xã/phường' })
  @IsUUID('4', { message: 'wardId phải là định dạng UUID v4' })
  @IsOptional()
  wardId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái đã xác thực hay chưa',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  verified?: boolean;

  @ApiPropertyOptional({
    description: 'Lọc chủ thể theo ID người sở hữu (User)',
  })
  @IsUUID('4', { message: 'ownerId phải là định dạng UUID v4' })
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({
    description: 'Bao gồm tài khoản Seller đã khóa (chỉ ADMIN)',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeInactive?: boolean;
}
