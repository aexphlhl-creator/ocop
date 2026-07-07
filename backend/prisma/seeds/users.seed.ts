import { PrismaClient, Role, RoleName, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsers(
  prisma: PrismaClient,
  rolesMap: Record<string, Role>
): Promise<Record<string, User>> {
  const adminRole = rolesMap[RoleName.ADMIN];
  const sellerRole = rolesMap[RoleName.SELLER];

  if (!adminRole || !sellerRole) {
    throw new Error('Missing required roles for seeding users');
  }

  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const sellerPasswordHash1 = bcrypt.hashSync('seller123', 10);
  const sellerPasswordHash2 = bcrypt.hashSync('seller123', 10);

  const usersData = [
    {
      email: 'admin@ocop.gov.vn',
      fullName: 'Hệ thống OCOP Việt Nam',
      passwordHash: adminPasswordHash,
      phone: '0123456789',
      roleId: adminRole.id,
      isActive: true,
    },
    {
      email: 'seller1@ocop.gov.vn',
      fullName: 'Doanh nghiệp Bắc Bộ',
      passwordHash: sellerPasswordHash1,
      phone: '0987654321',
      roleId: sellerRole.id,
      isActive: true,
    },
    {
      email: 'seller2@ocop.gov.vn',
      fullName: 'Hợp tác xã Lâm Đồng',
      passwordHash: sellerPasswordHash2,
      phone: '0909090909',
      roleId: sellerRole.id,
      isActive: true,
    },
  ];

  const usersMap: Record<string, User> = {};
  for (const user of usersData) {
    const createdUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        phone: user.phone,
        roleId: user.roleId,
        isActive: user.isActive,
      },
      create: user,
    });
    usersMap[user.email] = createdUser;
  }
  return usersMap;
}
