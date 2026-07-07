import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty({ example: 'Hợp tác xã Gốm sứ Bát Tràng', description: 'Tên chủ thể sản xuất' })
  @IsString()
  @IsNotEmpty({ message: 'Tên chủ thể không được để trống' })
  name: string;

  @ApiProperty({ example: '0101234567', description: 'Mã số thuế doanh nghiệp' })
  @IsString()
  @IsNotEmpty({ message: 'Mã số thuế không được để trống' })
  taxCode: string;

  @ApiPropertyOptional({ example: '0243874000', description: 'Số điện thoại liên hệ' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@battrang.vn', description: 'Email liên hệ' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Số 10, Xóm 5, Bát Tràng', description: 'Địa chỉ chi tiết' })
  @IsString()
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  address: string;

  @ApiProperty({ example: 'province-uuid', description: 'ID tỉnh/thành phố' })
  @IsUUID('4', { message: 'provinceId phải là định dạng UUID v4' })
  provinceId: string;

  @ApiProperty({ example: 'ward-uuid', description: 'ID xã/phường' })
  @IsUUID('4', { message: 'wardId phải là định dạng UUID v4' })
  wardId: string;

  @ApiPropertyOptional({ example: 'user-uuid', description: 'ID người sở hữu (Chỉ Admin được truyền)' })
  @IsUUID('4', { message: 'ownerId phải là định dạng UUID v4' })
  @IsOptional()
  ownerId?: string;
}
