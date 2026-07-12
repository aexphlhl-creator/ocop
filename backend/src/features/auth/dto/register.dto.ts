import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { RoleName } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên của người dùng' })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được trống' })
  fullName: string;

  @ApiProperty({ example: 'seller1@ocop.gov.vn', description: 'Địa chỉ email độc nhất' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'securePassword123', description: 'Mật khẩu tối thiểu 6 ký tự' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có tối thiểu 6 ký tự' })
  password: string;

  @ApiProperty({ example: '0987654321', description: 'Số điện thoại liên hệ (Tùy chọn)', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: ['VISITOR', 'SELLER'], example: RoleName.VISITOR, description: 'Vai trò người dùng đăng ký' })
  @IsEnum(['VISITOR', 'SELLER'], { message: 'Vai trò không hợp lệ, chỉ chấp nhận VISITOR hoặc SELLER' })
  @IsOptional()
  role?: RoleName;
}
