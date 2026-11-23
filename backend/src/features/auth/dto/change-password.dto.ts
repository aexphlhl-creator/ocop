import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu mới không được vượt quá 72 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Mật khẩu mới phải có chữ hoa, chữ thường và chữ số',
  })
  newPassword: string;
}
