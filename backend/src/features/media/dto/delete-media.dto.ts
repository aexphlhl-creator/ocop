import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteMediaDto {
  @ApiProperty({
    example: 'products/1672839120-12345.png',
    description: 'Đường dẫn định danh Object Name trong MinIO',
  })
  @IsString({ message: 'objectName phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'objectName không được để trống' })
  objectName: string;
}
