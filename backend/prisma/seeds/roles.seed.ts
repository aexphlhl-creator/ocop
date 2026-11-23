import { PrismaClient, Role, RoleName } from '@prisma/client';

export async function seedRoles(
  prisma: PrismaClient,
): Promise<Record<string, Role>> {
  const rolesData = [
    { name: RoleName.ADMIN, description: 'System administrator' },
    { name: RoleName.SELLER, description: 'OCOP seller and business owner' },
    {
      name: RoleName.WAREHOUSE_MANAGER,
      description: 'Warehouse manager scoped to assigned warehouses',
    },
    {
      name: RoleName.QUALITY_ASSURANCE,
      description: 'Independent QA/QC operator responsible for lot inspection and release',
    },
    {
      name: RoleName.LOGISTICS,
      description: 'Logistics staff scoped to assigned inventory batches',
    },
    { name: RoleName.VISITOR, description: 'Public visitor and customer' },
    { name: RoleName.EVENT_COORDINATOR, description: 'OCOP event coordinator' },
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
