import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWarehouseManagerDto {
  @ApiProperty({ example: 'Nguyễn Văn Quản' })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được trống' })
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'warehouse.manager@ocop.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    description: 'Có ít nhất một chữ thường, một chữ hoa và một chữ số',
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu không được vượt quá 72 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có chữ hoa, chữ thường và chữ số',
  })
  password: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;
}
