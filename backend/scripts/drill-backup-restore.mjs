import { Client } from 'pg';
import { execFileSync } from 'child_process';
import { randomUUID, createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * PostgreSQL Production Disaster Recovery & Backup/Restore Drill
 * Real end-to-end drill applying full OCOP Prisma schema and baseline seeds,
 * adding essential relational business entities across users, sellers, products,
 * warehouses, inventory, orders, items, and blockchain ledgers.
 * Verifies table-by-table row counts and deterministic normalized SHA-256 checksums,
 * tests pg_dump and pg_restore, validates `prisma migrate status`,
 * and enforces strict fail-closed tracking on cleanup.
 */

function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    if (Array.isArray(val)) return val.map(normalizeValue);
    const sorted = {};
    Object.keys(val)
      .sort()
      .forEach((k) => {
        sorted[k] = normalizeValue(val[k]);
      });
    return sorted;
  }
  return String(val);
}

function normalizeRow(row) {
  const sorted = {};
  Object.keys(row)
    .sort()
    .forEach((k) => {
      sorted[k] = normalizeValue(row[k]);
    });
  return sorted;
}

async function auditDatabaseTables(client) {
  // Query all actual public base tables from information_schema
  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name != '_prisma_migrations'
    ORDER BY table_name ASC;
  `);

  const allTableNames = tablesRes.rows.map((r) => r.table_name);
  const tableReports = [];
  const compositeHash = createHash('sha256');

  for (const tableName of allTableNames) {
    const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM "${tableName}";`);
    const rowCount = countRes.rows[0].cnt;

    let tableChecksum = 'N/A (0 ROWS)';
    if (rowCount > 0) {
      const rowsRes = await client.query(`SELECT * FROM "${tableName}";`);
      const normalizedRows = rowsRes.rows.map(normalizeRow);

      // Sort rows deterministically by id if present, otherwise by JSON representation
      normalizedRows.sort((a, b) => {
        if (a.id && b.id) return String(a.id).localeCompare(String(b.id));
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
      });

      const serializedData = JSON.stringify(normalizedRows);
      tableChecksum = createHash('sha256').update(serializedData).digest('hex');
      compositeHash.update(`${tableName}:${tableChecksum}\n`);
    }

    tableReports.push({
      tableName,
      rowCount,
      checksum: tableChecksum,
      isVerified: rowCount > 0,
    });
  }

  return {
    tableReports,
    compositeChecksum: compositeHash.digest('hex'),
  };
}

async function runDrill() {
  console.log('[BACKUP-RESTORE DRILL] Initiating PostgreSQL Disaster Recovery Drill with full OCOP Prisma schema...');

  const pgAdminUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable';
  const urlObj = new URL(pgAdminUrl);
  urlObj.pathname = '/postgres';

  const drillId = randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const srcDb = `ocop_drill_src_${drillId}`;
  const dstDb = `ocop_drill_dst_${drillId}`;
  const dumpFilePath = `/tmp/ocop_backup_drill_${drillId}.dump`;

  const adminClient = new Client({ connectionString: urlObj.toString() });
  adminClient.on('error', () => {});
  await adminClient.connect();

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let drillSuccess = false;
  const orphanedResources = [];

  try {
    // 1. Create source drill database
    console.log(`[DRILL STEP 1] Creating isolated source database: ${srcDb}...`);
    await adminClient.query(`CREATE DATABASE ${srcDb};`);

    const srcUrl = new URL(pgAdminUrl);
    srcUrl.pathname = `/${srcDb}`;

    // 2. Run full production Prisma migrations on source database
    console.log('[DRILL STEP 2] Applying all 30 OCOP Prisma migrations onto source database...');
    execFileSync(npxCmd, ['prisma', 'migrate', 'deploy'], {
      cwd: join(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: srcUrl.toString(),
      },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    // 3. Seed baseline production reference data via prisma/seed.ts (DEMO_MODE=false)
    console.log('[DRILL STEP 3] Seeding baseline reference data via prisma/seed.ts (DEMO_MODE=false)...');
    execFileSync(npxCmd, ['ts-node', 'prisma/seed.ts'], {
      cwd: join(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: srcUrl.toString(),
        DEMO_MODE: 'false',
        SEED_DEMO_DATA: 'false',
      },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    // Connect to source DB and seed core relational business entities
    const srcClient = new Client({ connectionString: srcUrl.toString() });
    srcClient.on('error', () => {});
    await srcClient.connect();

    console.log('[DRILL STEP 3b] Seeding critical business relationships (Users, Profiles, Products, Warehouses, Inventory, Orders, Blockchain)...');
    await srcClient.query(`
      -- 1. Users
      INSERT INTO "users" ("id", "email", "password_hash", "full_name", "role_id", "is_active", "must_change_password", "created_at", "updated_at")
      VALUES
        ('11111111-1111-4111-8111-111111111111', 'admin.drill@ocop.vn', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'Admin Drill Operator', (SELECT id FROM roles WHERE name = 'ADMIN'), true, false, NOW(), NOW()),
        ('22222222-2222-4222-8222-222222222222', 'seller.drill@ocop.vn', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'HTX Che Shan Tuyet', (SELECT id FROM roles WHERE name = 'SELLER'), true, false, NOW(), NOW()),
        ('33333333-3333-4333-8333-333333333333', 'qa.drill@ocop.vn', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'QA Inspector Ha Giang', (SELECT id FROM roles WHERE name = 'QUALITY_ASSURANCE'), true, false, NOW(), NOW()),
        ('44444444-4444-4444-8444-444444444444', 'customer.drill@ocop.vn', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash', 'Khach Hang Drill', (SELECT id FROM roles WHERE name = 'VISITOR'), true, false, NOW(), NOW());

      -- 2. SellerProfile
      INSERT INTO "seller_profiles" ("id", "seller_id", "display_name", "tax_code", "address", "phone", "email", "province_id", "ward_id", "created_at", "updated_at")
      VALUES (
        '55555555-5555-4555-8555-555555555555',
        '22222222-2222-4222-8222-222222222222',
        'HTX Che Shan Tuyet Co Thu',
        '0102030405',
        'Thon Nam Dan, Nam Dan, Xin Man, Ha Giang',
        '0987654321',
        'seller.drill@ocop.vn',
        (SELECT id FROM provinces LIMIT 1),
        (SELECT id FROM wards LIMIT 1),
        NOW(),
        NOW()
      );

      -- 3. Products
      INSERT INTO "products" ("id", "name", "slug", "description", "price", "unit", "ocop_level_id", "category_id", "seller_id", "ward_id", "province_id", "latitude", "longitude", "status", "created_at", "updated_at")
      VALUES (
        '66666666-6666-4666-8666-666666666666',
        'Tra Shan Tuyet Co Thu Ha Giang Drill',
        'tra-shan-tuyet-co-thu-ha-giang-drill',
        'Tra shan tuyet 5 sao OCOP',
        350000.00,
        'Hop 200g',
        (SELECT id FROM ocop_levels WHERE level = 5 LIMIT 1),
        (SELECT id FROM categories WHERE slug = 'do-uong' LIMIT 1),
        '22222222-2222-4222-8222-222222222222',
        (SELECT id FROM wards LIMIT 1),
        (SELECT id FROM provinces LIMIT 1),
        22.75,
        104.98,
        'APPROVED',
        NOW(),
        NOW()
      );

      -- 4. Warehouses & Inventory
      INSERT INTO "warehouses" ("id", "code", "name", "address", "seller_id", "is_active", "created_at", "updated_at")
      VALUES (
        '77777777-7777-4777-8777-777777777777',
        'WH-DRILL-001',
        'Kho Tong Ha Giang Drill',
        '123 Nguyen Trai, Ha Giang',
        '22222222-2222-4222-8222-222222222222',
        true,
        NOW(),
        NOW()
      );

      INSERT INTO "inventories" ("id", "warehouse_id", "product_id", "current_quantity", "reserved_quantity", "updated_at")
      VALUES (
        '88888888-8888-4888-8888-888888888888',
        '77777777-7777-4777-8777-777777777777',
        '66666666-6666-4666-8666-666666666666',
        100,
        5,
        NOW()
      );

      -- 5. Orders & OrderItems
      INSERT INTO "orders" ("id", "user_id", "seller_id", "total_amount", "shipping_address", "phone", "status", "payment_status", "payment_method", "created_at", "updated_at")
      VALUES (
        '99999999-9999-4999-8999-999999999999',
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
        350000.00,
        'So 1 Trang Tien, Hoan Kiem, Ha Noi',
        '0912345678',
        'DELIVERED',
        'COMPLETED',
        'COD',
        NOW(),
        NOW()
      );

      INSERT INTO "order_items" ("id", "order_id", "product_id", "quantity", "price", "created_at")
      VALUES (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '99999999-9999-4999-8999-999999999999',
        '66666666-6666-4666-8666-666666666666',
        1,
        350000.00,
        NOW()
      );

      -- 6. Blockchain Records
      INSERT INTO "blockchain_records" ("id", "product_id", "action", "data", "previous_hash", "hash", "transaction_hash", "block_number", "status", "created_at", "updated_at")
      VALUES (
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        '66666666-6666-4666-8666-666666666666',
        'BATCH_RELEASED',
        '{"event": "BATCH_RELEASED", "batchId": "55555555-5555-4555-8555-555555555555"}'::jsonb,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        100500,
        'CONFIRMED',
        NOW(),
        NOW()
      );
    `);

    // Audit source database tables and row counts
    const srcAudit = await auditDatabaseTables(srcClient);
    await srcClient.end();

    console.log('\n[DRILL STEP 3c] === SOURCE DATABASE TABLE-BY-TABLE AUDIT REPORT ===');
    let verifiedCount = 0;
    let unverifiedCount = 0;
    for (const report of srcAudit.tableReports) {
      if (report.isVerified) {
        verifiedCount++;
        console.log(
          `  [VERIFIED] Table: ${report.tableName.padEnd(28)} | Rows: ${String(report.rowCount).padStart(4)} | SHA-256: ${report.checksum.slice(0, 16)}...`,
        );
      } else {
        unverifiedCount++;
        console.log(
          `  [UNVERIFIED - 0 ROWS] Table: ${report.tableName.padEnd(28)} | Rows:    0 | (No test fixture seeded for this entity)`,
        );
      }
    }
    console.log(
      `Summary: ${srcAudit.tableReports.length} total base tables (${verifiedCount} verified with relational data, ${unverifiedCount} unverified with 0 rows).`,
    );
    console.log(`Source Normalized Composite Checksum (SHA-256): ${srcAudit.compositeChecksum}\n`);

    // 4. Create logical binary dump via pg_dump
    console.log(`[DRILL STEP 4] Creating pg_dump binary custom-format backup to ${dumpFilePath}...`);
    execFileSync(
      'docker',
      ['exec', 'ocop-postgres', 'pg_dump', '-U', 'postgres', '-d', srcDb, '-F', 'c', '-f', dumpFilePath],
      { encoding: 'utf8' },
    );

    const dumpCheck = execFileSync(
      'docker',
      ['exec', 'ocop-postgres', 'stat', '-c', '%s', dumpFilePath],
      { encoding: 'utf8' },
    ).trim();
    const dumpSizeBytes = parseInt(dumpCheck, 10);
    console.log(`[DRILL STEP 4] Backup dump created. Size: ${dumpSizeBytes} bytes.`);
    if (isNaN(dumpSizeBytes) || dumpSizeBytes <= 0) {
      throw new Error(`Dump file is missing or has 0 bytes: ${dumpFilePath}`);
    }

    // 5. Create restore destination database
    console.log(`[DRILL STEP 5] Creating isolated target database: ${dstDb}...`);
    await adminClient.query(`CREATE DATABASE ${dstDb};`);

    // 6. Restore backup dump via pg_restore
    console.log(`[DRILL STEP 6] Restoring backup dump into ${dstDb} via pg_restore...`);
    execFileSync(
      'docker',
      ['exec', 'ocop-postgres', 'pg_restore', '-U', 'postgres', '-d', dstDb, dumpFilePath],
      { encoding: 'utf8' },
    );

    // 7. Verify prisma migrate status on restored database
    console.log('[DRILL STEP 7] Running prisma migrate status against restored database...');
    const dstUrl = new URL(pgAdminUrl);
    dstUrl.pathname = `/${dstDb}`;

    const migrateStatusOutput = execFileSync(
      npxCmd,
      ['prisma', 'migrate', 'status'],
      {
        cwd: join(__dirname, '..'),
        env: {
          ...process.env,
          DATABASE_URL: dstUrl.toString(),
        },
        encoding: 'utf8',
        shell: process.platform === 'win32',
      },
    );
    console.log('[DRILL STEP 7] prisma migrate status result:\n' + migrateStatusOutput.trim());

    if (!migrateStatusOutput.includes('Database schema is up to date')) {
      throw new Error(`Prisma migrate status is not up to date on restored database:\n${migrateStatusOutput}`);
    }

    // 8. Reconcile restored database table-by-table
    console.log('\n[DRILL STEP 8] Reconciling restored tables via normalized relational data parity...');
    const dstClient = new Client({ connectionString: dstUrl.toString() });
    dstClient.on('error', () => {});
    await dstClient.connect();

    const dstAudit = await auditDatabaseTables(dstClient);
    await dstClient.end();

    if (srcAudit.tableReports.length !== dstAudit.tableReports.length) {
      throw new Error(
        `Table count mismatch: Source has ${srcAudit.tableReports.length} tables, restored has ${dstAudit.tableReports.length} tables.`,
      );
    }

    for (let i = 0; i < srcAudit.tableReports.length; i++) {
      const srcT = srcAudit.tableReports[i];
      const dstT = dstAudit.tableReports[i];

      if (srcT.tableName !== dstT.tableName) {
        throw new Error(`Table alignment error at index ${i}: expected ${srcT.tableName}, got ${dstT.tableName}`);
      }
      if (srcT.rowCount !== dstT.rowCount) {
        throw new Error(
          `Row count mismatch on table "${srcT.tableName}": Source has ${srcT.rowCount}, Restored has ${dstT.rowCount}.`,
        );
      }
      if (srcT.isVerified && srcT.checksum !== dstT.checksum) {
        throw new Error(
          `Deterministic checksum mismatch on table "${srcT.tableName}": Source=${srcT.checksum}, Restored=${dstT.checksum}`,
        );
      }
    }

    if (srcAudit.compositeChecksum !== dstAudit.compositeChecksum) {
      throw new Error(
        `Composite SHA-256 checksum mismatch!\nSource:   ${srcAudit.compositeChecksum}\nRestored: ${dstAudit.compositeChecksum}`,
      );
    }

    console.log('[DRILL STEP 8] RECONCILIATION PASSED: 100% normalized relational data parity verified across all tables.');
    drillSuccess = true;
  } finally {
    // 9. Cleanup with strict failure tracking (fail drill if any resource cannot be cleaned)
    console.log('\n[DRILL CLEANUP] Destroying drill databases and unlinking dump file...');
    let cleanupFailed = false;

    if (process.env.SIMULATE_DRILL_CLEANUP_FAILURE === 'true') {
      console.error('[DRILL SIMULATION] Triggering simulated cleanup failure for source DB.');
      cleanupFailed = true;
      orphanedResources.push(`Database: ${srcDb} (Simulated Cleanup Failure)`);
    } else {
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS ${srcDb} WITH (FORCE);`);
        console.log(`[DRILL CLEANUP] Dropped source DB: ${srcDb}`);
      } catch (err) {
        console.error(`[DRILL CLEANUP ERROR] Failed to drop source DB ${srcDb}: ${err.message}`);
        cleanupFailed = true;
        orphanedResources.push(`Database: ${srcDb}`);
      }
    }

    try {
      await adminClient.query(`DROP DATABASE IF EXISTS ${dstDb} WITH (FORCE);`);
      console.log(`[DRILL CLEANUP] Dropped target DB: ${dstDb}`);
    } catch (err) {
      console.error(`[DRILL CLEANUP ERROR] Failed to drop target DB ${dstDb}: ${err.message}`);
      cleanupFailed = true;
      orphanedResources.push(`Database: ${dstDb}`);
    }

    try {
      execFileSync('docker', ['exec', 'ocop-postgres', 'rm', '-f', dumpFilePath], { stdio: 'pipe' });
      console.log(`[DRILL CLEANUP] Removed dump file: ${dumpFilePath}`);
    } catch (err) {
      console.error(`[DRILL CLEANUP ERROR] Failed to unlink dump file ${dumpFilePath}: ${err.message}`);
      cleanupFailed = true;
      orphanedResources.push(`File: ${dumpFilePath}`);
    }

    await adminClient.end().catch(() => {});

    if (cleanupFailed) {
      console.error('\n[DRILL CRITICAL WARNING] Cleanup was NOT fully successful! Orphaned resources remaining:');
      for (const res of orphanedResources) {
        console.error(`  - ${res}`);
      }
      drillSuccess = false;
    }
  }

  if (drillSuccess) {
    console.log('\n[BACKUP-RESTORE DRILL] SUCCESS: Full OCOP Disaster Recovery Drill verified with zero orphaned resources.\n');
    process.exit(0);
  } else {
    console.error('\n[BACKUP-RESTORE DRILL] FAILED: Drill did not complete cleanly or cleanup encountered errors.\n');
    process.exit(1);
  }
}

runDrill().catch((err) => {
  console.error('[BACKUP-RESTORE DRILL FATAL ERROR]', err);
  process.exit(1);
});
