import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { seedRoles } from './seeds/roles.seed';
import { seedUsers } from './seeds/users.seed';
import { seedProvinces } from './seeds/provinces.seed';
import { seedWards } from './seeds/wards.seed';
import { seedBusinesses } from './seeds/businesses.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedProducts } from './seeds/products.seed';
import { seedNews } from './seeds/news.seed';
import { seedOcopLevels } from './seeds/ocop-levels.seed';
import { seedSupplyChainStages } from './seeds/supply-chain-stages.seed';
import { seedCertificateTypes } from './seeds/certificate-types.seed';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting execution of database seeding...\n');

  try {
    // 1. Seed Prerequisites
    const provinces = await seedProvinces(prisma);
    console.log('✓ Provinces seeded (34)');

    const categories = await seedCategories(prisma);
    console.log(`✓ Categories seeded (${Object.keys(categories).length})`);

    const ocopLevels = await seedOcopLevels(prisma);
    console.log(`✓ OCOP Levels seeded (${Object.keys(ocopLevels).length})`);

    // 2. Seed Wards
    const wards = await seedWards(prisma, provinces);
    console.log(`✓ Wards seeded (${Object.keys(wards).length})`);

    // 3. Atomically seed Roles, Users, Businesses, Products inside a transaction
    let userCount = 0;
    let businessCount = 0;
    let productCount = 0;

    await prisma.$transaction(async (tx) => {
      const roles = await seedRoles(tx as any);
      const users = await seedUsers(tx as any, roles);
      userCount = Object.keys(users).length;

      const businesses = await seedBusinesses(tx as any, users, provinces, wards);
      businessCount = Object.keys(businesses).length;

      productCount = await seedProducts(tx as any, categories, businesses, provinces, wards, ocopLevels);
    });

    console.log('✓ Roles seeded');
    console.log(`✓ Users seeded (${userCount})`);
    console.log(`✓ Businesses seeded (${businessCount})`);
    console.log(`✓ Products seeded (${productCount})`);

    // 4. Seed News
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@ocop.gov.vn' },
    });
    const newsCount = await seedNews(prisma, {
      'admin@ocop.gov.vn': adminUser,
    });
    console.log(`✓ News seeded (${newsCount})`);

    // 5. Seed Supply Chain Stages (lookup data)
    const stageCount = await seedSupplyChainStages(prisma);
    console.log(`✓ Supply Chain Stages seeded (${stageCount})`);

    const certificateTypeCount = await seedCertificateTypes(prisma);
    console.log(`✓ Certificate Types seeded (${certificateTypeCount})`);

    console.log('\nDatabase seeded successfully.');
  } catch (error: any) {
    console.error('\n❌ Seeding failed with error:');
    if (error.code === 'P2002') {
      const target = error.meta?.target || 'unknown target';
      console.error(`[Duplicate Key Error] A unique constraint violation occurred on target field: ${target}`);
    } else if (error.code === 'P2003') {
      console.error('[Foreign Key Error] A database relation mapping constraint failed. Verify foreign key records exist.');
    } else if (error.message) {
      console.error(`[Execution Error] ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Unhandled seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
