import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6',
    description: 'UUID của người dùng',
  })
  id: string;

  @ApiProperty({ example: 'seller1@ocop.gov.vn', description: 'Địa chỉ email' })
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên đầy đủ' })
  fullName: string;

  @ApiProperty({ example: '0987654321', description: 'Số điện thoại' })
  phone: string | null;

  @ApiProperty({
    example: RoleName.SELLER,
    enum: RoleName,
    description: 'Vai trò trong hệ thống',
  })
  role: RoleName;

  @ApiProperty({ example: true, description: 'Trạng thái hoạt động' })
  isActive: boolean;

  @ApiProperty({ example: false, description: 'Bắt buộc đổi mật khẩu tạm' })
  mustChangePassword: boolean;

  @ApiProperty({
    example: '2026-07-07T12:00:00.000Z',
    description: 'Thời điểm tạo tài khoản',
  })
  createdAt: Date;
}
