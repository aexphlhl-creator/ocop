import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
    description:
      'Google ID Token (JWT) được trả về từ Google Identity Services',
  })
  @IsString({ message: 'idToken phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;
}
