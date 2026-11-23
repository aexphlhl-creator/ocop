import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được trống' })
  @MaxLength(100)
  fullName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;
}
