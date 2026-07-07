import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'seller1@ocop.gov.vn', description: 'Địa chỉ email đăng nhập' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'securePassword123', description: 'Mật khẩu truy cập' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được trống' })
  password: string;
}
