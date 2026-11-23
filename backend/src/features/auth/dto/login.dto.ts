import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'seller1@ocop.gov.vn',
    description: 'Địa chỉ email đăng nhập',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: 'securePassword123',
    description: 'Mật khẩu truy cập',
  })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được trống' })
  @MaxLength(72, { message: 'Mật khẩu không được vượt quá 72 ký tự' })
  password: string;
}
