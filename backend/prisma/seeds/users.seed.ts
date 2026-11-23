import { PrismaClient, Role, RoleName, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsers(
  prisma: PrismaClient,
  rolesMap: Record<string, Role>
): Promise<Record<string, User>> {
  const adminRole = rolesMap[RoleName.ADMIN];
  const sellerRole = rolesMap[RoleName.SELLER];
  const visitorRole = rolesMap[RoleName.VISITOR];

  if (!adminRole || !sellerRole || !visitorRole) {
    throw new Error('Missing required roles for seeding users');
  }

  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const sellerPasswordHash1 = bcrypt.hashSync('seller123', 10);
  const sellerPasswordHash2 = bcrypt.hashSync('seller123', 10);
  const customerPasswordHash = bcrypt.hashSync('customer123', 10);

  const usersData = [
    {
      email: 'admin@demo.com',
      fullName: 'OCOP Demo Admin',
      passwordHash: adminPasswordHash,
      phone: '0900000001',
      roleId: adminRole.id,
      isActive: true,
    },
    {
      email: 'seller@demo.com',
      fullName: 'OCOP Demo Seller',
      passwordHash: sellerPasswordHash1,
      phone: '0900000002',
      roleId: sellerRole.id,
      isActive: true,
    },
    {
      email: 'customer@demo.com',
      fullName: 'OCOP Demo Customer',
      passwordHash: customerPasswordHash,
      phone: '0900000003',
      roleId: visitorRole.id,
      isActive: true,
    },
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
      fullName: 'Hợp tác xã Gốm sứ Bát Tràng',
      passwordHash: sellerPasswordHash1,
      phone: '0987654321',
      roleId: sellerRole.id,
      isActive: true,
    },
    {
      email: 'seller2@ocop.gov.vn',
      fullName: 'Hợp tác xã Mỳ gạo Hùng Lô',
      passwordHash: sellerPasswordHash2,
      phone: '0909090909',
      roleId: sellerRole.id,
      isActive: true,
    },
    {
      email: 'seller3@ocop.gov.vn',
      fullName: 'Đà Lạt Gift',
      passwordHash: sellerPasswordHash2,
      phone: '0909090910',
      roleId: sellerRole.id,
      isActive: true,
    },
    {
      email: 'seller4@ocop.gov.vn',
      fullName: 'Cơ sở sản xuất muối Cần Giờ Hải Nam',
      passwordHash: sellerPasswordHash2,
      phone: '0909090911',
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
    if (user.roleId === sellerRole.id) {
      await prisma.sellerProfile.upsert({
        where: { sellerId: createdUser.id },
        update: {
          displayName: user.fullName,
          phone: user.phone,
          email: user.email,
        },
        create: {
          sellerId: createdUser.id,
          displayName: user.fullName,
          phone: user.phone,
          email: user.email,
        },
      });
    }
    usersMap[user.email] = createdUser;
  }
  return usersMap;
}
