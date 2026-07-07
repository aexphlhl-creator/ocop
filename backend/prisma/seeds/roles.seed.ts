import { PrismaClient, Role } from '@prisma/client';

export async function seedRoles(prisma: PrismaClient): Promise<Record<string, Role>> {
  const rolesData = [
    { name: 'ADMIN', description: 'Quản trị viên hệ thống' },
    { name: 'SELLER', description: 'Chủ thể doanh nghiệp sản xuất OCOP' },
    { name: 'VISITOR', description: 'Người dùng xem bản đồ công cộng' },
  ];

  const rolesMap: Record<string, Role> = {};
  for (const role of rolesData) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
    rolesMap[role.name] = createdRole;
  }
  return rolesMap;
}
