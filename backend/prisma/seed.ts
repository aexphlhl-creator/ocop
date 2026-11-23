import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { seedRoles } from './seeds/roles.seed';
import { seedUsers } from './seeds/users.seed';
import { seedProvinces } from './seeds/provinces.seed';
import { seedWards } from './seeds/wards.seed';
import { seedSellerProfiles } from './seeds/seller-profiles.seed';
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

    // 3. Seed Roles
    const roles = await seedRoles(prisma);
    console.log(`✓ Roles seeded (${Object.keys(roles).length})`);

    // 4. Seed Supply Chain Stages (lookup data)
    const stageCount = await seedSupplyChainStages(prisma);
    console.log(`✓ Supply Chain Stages seeded (${stageCount})`);

    const certificateTypeCount = await seedCertificateTypes(prisma);
    console.log(`✓ Certificate Types seeded (${certificateTypeCount})`);

    const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.SEED_DEMO_DATA === 'true';

    if (!isDemoMode) {
      console.log('\n[PRODUCTION MODE] Production baseline data (Roles, Categories, OCOP Levels, Provinces, Wards, Stages, Certificate Types) seeded successfully.');
      console.log('Notice: Demo accounts and demo products are skipped. Use `npm run admin:create` to safely create the initial Admin.');
      return;
    }

    console.log('\n[DEMO MODE DETECTED] Seeding demo users, sellers, products, and news...');

    // 5. Atomically seed Demo Users, Seller Profiles and Products.
    let userCount = 0;
    let sellerProfileCount = 0;
    let productCount = 0;

    await prisma.$transaction(
      async (tx) => {
        const users = await seedUsers(tx as any, roles);
        userCount = Object.keys(users).length;

        const sellerProfiles = await seedSellerProfiles(tx as any, users, provinces, wards);
        sellerProfileCount = Object.keys(sellerProfiles).length;

        productCount = await seedProducts(tx as any, categories, sellerProfiles, provinces, wards, ocopLevels);
      },
      {
        timeout: 60000,
      }
    );

    console.log(`✓ Demo Users seeded (${userCount})`);
    console.log(`✓ Demo Seller Profiles seeded (${sellerProfileCount})`);
    console.log(`✓ Demo Products seeded (${productCount})`);

    // 6. Seed Demo News
    const adminUser = await prisma.user.findFirst({
      where: { role: { name: 'ADMIN' } },
    });
    if (adminUser) {
      const newsCount = await seedNews(prisma, {
        [adminUser.email]: adminUser,
      });
      console.log(`✓ News seeded (${newsCount})`);
    }

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
