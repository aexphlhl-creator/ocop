import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const migrationRoot = path.join(backendRoot, 'prisma', 'migrations');
const userId = '10000000-0000-4000-8000-000000000001';
const roleId = '20000000-0000-4000-8000-000000000001';
const aggregateId = '30000000-0000-4000-8000-000000000001';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectSqlFailure(operation, expectedPattern) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      expectedPattern.test(message),
      `SQL failed for an unexpected reason: ${message}`,
    );
    return;
  }
  throw new Error('Expected the database constraint to reject the statement');
}

const db = new PGlite();
try {
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const directory of directories) {
    const migrationFile = path.join(migrationRoot, directory, 'migration.sql');
    const sql = await readFile(migrationFile, 'utf8');
    await db.exec(sql);
  }

  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'payment_aggregates', 'payment_transactions',
        'payment_query_attempts', 'refund_attempts',
        'order_item_batch_reservations'
      )
    ORDER BY table_name
  `);
  assert(
    tables.rows.length === 5,
    'Secure payment tables were not all created',
  );

  const warehouseManagerRole = await db.query(`
    SELECT "name"::text AS name FROM "roles"
    WHERE "name" = 'WAREHOUSE_MANAGER'
  `);
  assert(
    warehouseManagerRole.rows.length === 1,
    'WAREHOUSE_MANAGER role was not created by the migration',
  );

  const logisticsRole = await db.query(`
    SELECT "name"::text AS name FROM "roles"
    WHERE "name" = 'LOGISTICS'
  `);
  assert(
    logisticsRole.rows.length === 1,
    'LOGISTICS role was not created by the migration',
  );

  const handoverStage = await db.query(`
    SELECT "name"::text AS name, "order" FROM "supply_chain_stages"
    WHERE "name" = 'HANDOVER_TO_CARRIER'
  `);
  assert(
    handoverStage.rows.length === 1 && handoverStage.rows[0].order === 7,
    'HANDOVER_TO_CARRIER stage was not created at order 7',
  );
  const shippingStage = await db.query(`
    SELECT "order" FROM "supply_chain_stages" WHERE "name" = 'SHIPPING'
  `);
  assert(
    shippingStage.rows.length === 1 && shippingStage.rows[0].order === 8,
    'SHIPPING stage was not shifted to order 8',
  );
  const stageCount = await db.query(`
    SELECT COUNT(*)::int AS count FROM "supply_chain_stages"
  `);
  assert(
    stageCount.rows[0].count === 11,
    'A clean database must contain all 11 supply-chain stages',
  );

  const logisticsTables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'batch_logistics_assignments'
  `);
  assert(
    logisticsTables.rows.length === 1,
    'batch_logistics_assignments table was not created',
  );
  const activeAssignmentIndex = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'batch_logistics_assignments_one_active_per_batch_idx'
  `);
  assert(
    activeAssignmentIndex.rows.length === 1,
    'The one-active-logistics-assignment constraint was not created',
  );

  await db.exec(`
    INSERT INTO "roles" ("id", "name", "description", "updated_at")
    VALUES ('${roleId}', 'VISITOR', 'Migration test', CURRENT_TIMESTAMP);
    INSERT INTO "users" (
      "id", "email", "password_hash", "full_name", "role_id", "updated_at"
    ) VALUES (
      '${userId}', 'migration-test@example.com', 'not-a-real-password',
      'Migration Test', '${roleId}', CURRENT_TIMESTAMP
    );
    INSERT INTO "payment_aggregates" (
      "id", "user_id", "idempotency_key", "request_hash", "amount",
      "payment_method", "provider", "updated_at"
    ) VALUES (
      '${aggregateId}', '${userId}', 'same-key', repeat('a', 64), 10000,
      'VNPAY', 'VNPAY', CURRENT_TIMESTAMP
    );
  `);

  await expectSqlFailure(
    () =>
      db.exec(`
        INSERT INTO "payment_aggregates" (
          "id", "user_id", "idempotency_key", "request_hash", "amount",
          "payment_method", "provider", "updated_at"
        ) VALUES (
          '30000000-0000-4000-8000-000000000002', '${userId}', 'same-key',
          repeat('b', 64), 20000, 'VNPAY', 'VNPAY', CURRENT_TIMESTAMP
        )
      `),
    /unique/i,
  );

  await expectSqlFailure(
    () =>
      db.exec(`
        INSERT INTO "payment_aggregates" (
          "id", "user_id", "idempotency_key", "request_hash", "amount",
          "payment_method", "provider", "updated_at"
        ) VALUES (
          '30000000-0000-4000-8000-000000000003', '${userId}', 'bad-provider',
          repeat('c', 64), 10000, 'COD', 'VNPAY', CURRENT_TIMESTAMP
        )
      `),
    /payment_aggregates_method_provider_check/i,
  );

  await db.exec(`
    INSERT INTO "payment_transactions" (
      "id", "payment_aggregate_id", "txn_ref", "amount", "payment_url",
      "gateway_create_date", "expires_at", "updated_at"
    ) VALUES (
      '40000000-0000-4000-8000-000000000001', '${aggregateId}', 'txn-1',
      10000, 'https://sandbox.example/pay', '20260821080000',
      CURRENT_TIMESTAMP + INTERVAL '15 minutes', CURRENT_TIMESTAMP
    )
  `);
  await expectSqlFailure(
    () =>
      db.exec(`
        INSERT INTO "payment_transactions" (
          "id", "payment_aggregate_id", "txn_ref", "amount", "payment_url",
          "gateway_create_date", "expires_at", "updated_at"
        ) VALUES (
          '40000000-0000-4000-8000-000000000002', '${aggregateId}', 'txn-2',
          10000, 'https://sandbox.example/pay', '20260821080000',
          CURRENT_TIMESTAMP + INTERVAL '15 minutes', CURRENT_TIMESTAMP
        )
      `),
    /payment_transactions_one_pending_per_aggregate_idx/i,
  );
  await db.exec(`
    UPDATE "payment_transactions"
    SET "status" = 'EXPIRED', "processed_at" = CURRENT_TIMESTAMP
    WHERE "txn_ref" = 'txn-1';
    INSERT INTO "payment_transactions" (
      "id", "payment_aggregate_id", "txn_ref", "amount", "payment_url",
      "gateway_create_date", "expires_at", "updated_at"
    ) VALUES (
      '40000000-0000-4000-8000-000000000002', '${aggregateId}', 'txn-2',
      10000, 'https://sandbox.example/pay', '20260821080000',
      CURRENT_TIMESTAMP + INTERVAL '15 minutes', CURRENT_TIMESTAMP
    );
  `);
  const attempts = await db.query(`
    SELECT "status"::text AS status FROM "payment_transactions"
    WHERE "payment_aggregate_id" = '${aggregateId}' ORDER BY "txn_ref"
  `);
  assert(
    JSON.stringify(attempts.rows.map((row) => row.status)) ===
      JSON.stringify(['EXPIRED', 'PENDING']),
    'Transaction state/index behavior is incorrect',
  );

  console.log(
    `PASS: applied ${directories.length} migrations and verified payment, role, handover, and logistics constraints`,
  );
} finally {
  await db.close();
}
