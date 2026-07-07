import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên của người dùng' })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được trống' })
  fullName: string;

  @ApiProperty({ example: 'seller1@ocop.gov.vn', description: 'Địa chỉ email độc nhất' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'securePassword123', description: 'Mật khẩu tối thiểu 8 ký tự' })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  password: string;

  @ApiProperty({ example: '0987654321', description: 'Số điện thoại liên hệ' })
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được trống' })
  phone: string;
}
