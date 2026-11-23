import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { RoleName } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({
    example: 'Nguyễn Văn A',
    description: 'Họ và tên của người dùng',
  })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được trống' })
  fullName: string;

  @ApiProperty({
    example: 'seller1@ocop.gov.vn',
    description: 'Địa chỉ email độc nhất',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({
    example: 'securePassword123',
    description: 'Mật khẩu 8-72 ký tự, có chữ hoa, chữ thường và chữ số',
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu không được vượt quá 72 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có chữ hoa, chữ thường và chữ số',
  })
  password: string;

  @ApiProperty({
    example: '0987654321',
    description: 'Số điện thoại liên hệ (Tùy chọn)',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    enum: ['VISITOR'],
    example: RoleName.VISITOR,
    description: 'Vai trò người dùng đăng ký',
  })
  @IsEnum([RoleName.VISITOR], {
    message: 'Đăng ký công khai chỉ dành cho tài khoản người tiêu dùng',
  })
  @IsOptional()
  role?: RoleName;
}
