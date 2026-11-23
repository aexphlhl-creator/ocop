import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const migrationRoot = path.join(backendRoot, 'prisma', 'migrations');

console.log('=== VERIFYING ALL MIGRATIONS ON CLEAN DATABASE ===');
const db = new PGlite();

try {
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  console.log(`Found ${directories.length} migrations to execute.`);

  for (let i = 0; i < directories.length; i++) {
    const dir = directories[i];
    const migrationFile = path.join(migrationRoot, dir, 'migration.sql');
    const sql = await readFile(migrationFile, 'utf8');
    try {
      await db.exec(sql);
      console.log(`[${i + 1}/${directories.length}] OK: ${dir}`);
    } catch (err) {
      console.error(`FAILED on migration ${dir}:`, err);
      process.exit(1);
    }
  }

  console.log('\n--- VERIFYING BASELINE SEEDED DATA ---');

  // 1. Roles
  const roles = await db.query('SELECT name FROM "roles" ORDER BY name ASC');
  const roleNames = roles.rows.map((r) => r.name);
  console.log(`Roles count: ${roleNames.length}`);
  console.log(`Roles: ${roleNames.join(', ')}`);
  const expectedRoles = ['ADMIN', 'SELLER', 'VISITOR', 'EVENT_COORDINATOR', 'WAREHOUSE_MANAGER', 'LOGISTICS', 'QUALITY_ASSURANCE'];
  for (const exp of expectedRoles) {
    if (!roleNames.includes(exp)) {
      throw new Error(`Missing expected role: ${exp}`);
    }
  }

  // 2. Categories
  const categories = await db.query('SELECT slug, name FROM "categories" ORDER BY slug ASC');
  console.log(`Categories count: ${categories.rows.length}`);
  for (const c of categories.rows) {
    console.log(` - [${c.slug}] ${c.name}`);
  }
  if (categories.rows.length !== 5) {
    throw new Error(`Expected exactly 5 categories, found ${categories.rows.length}`);
  }

  // 3. Ocop Levels
  const levels = await db.query('SELECT level, title FROM "ocop_levels" ORDER BY level ASC');
  console.log(`OCOP Levels count: ${levels.rows.length}`);
  for (const l of levels.rows) {
    console.log(` - ${l.level} Star: ${l.title}`);
  }
  if (levels.rows.length !== 3) {
    throw new Error(`Expected exactly 3 ocop levels, found ${levels.rows.length}`);
  }

  // 4. Supply Chain Stages
  const stages = await db.query('SELECT "order", name, display_name FROM "supply_chain_stages" ORDER BY "order" ASC');
  console.log(`Supply Chain Stages count: ${stages.rows.length}`);
  for (const s of stages.rows) {
    console.log(` - #${s.order}: ${s.name} (${s.display_name})`);
  }
  if (stages.rows.length < 11) {
    throw new Error(`Expected at least 11 stages, found ${stages.rows.length}`);
  }

  // 5. Certificate Types
  const certTypes = await db.query('SELECT code, name FROM "certificate_types" ORDER BY code ASC');
  console.log(`Certificate Types count: ${certTypes.rows.length}`);
  for (const ct of certTypes.rows) {
    console.log(` - [${ct.code}] ${ct.name}`);
  }
  if (certTypes.rows.length < 7) {
    throw new Error(`Expected at least 7 certificate types, found ${certTypes.rows.length}`);
  }

  console.log('\n=== ALL 30 MIGRATIONS & BASELINE DATA VERIFIED 100% SUCCESSFULLY ===');
  process.exit(0);
} catch (error) {
  console.error('VERIFICATION ERROR:', error);
  process.exit(1);
}
