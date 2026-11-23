import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationRoot = path.resolve(scriptDirectory, '..', 'prisma', 'migrations');

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    await db.exec(await readFile(migrationFile, 'utf8'));
  }

  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'logistics_organizations', 'logistics_organization_members',
        'shipments', 'shipment_items', 'shipment_assignments', 'shipment_events',
        'carrier_webhook_events'
      )
  `);
  assert(tables.rows.length === 7, 'Production shipment tables are incomplete');

  const internalCarrier = await db.query(`
    SELECT "code", "type"::text AS type
    FROM "logistics_organizations" WHERE "code" = 'OCOP_INTERNAL'
  `);
  assert(
    internalCarrier.rows.length === 1 && internalCarrier.rows[0].type === 'INTERNAL',
    'Internal carrier was not seeded',
  );

  const indexes = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'shipments_created_by_id_idempotency_key_key',
        'shipments_carrier_organization_id_tracking_code_key',
        'shipment_assignments_one_active_per_shipment_idx',
        'shipment_events_shipment_id_idempotency_key_key'
      )
  `);
  assert(indexes.rows.length === 4, 'Shipment concurrency indexes are incomplete');

  const triggers = await db.query(`
    SELECT trigger_name FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'shipment_events'
  `);
  assert(triggers.rows.length === 2, 'Shipment event append-only triggers are missing');

  const quantityCheck = await db.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'shipment_items'
      AND constraint_name = 'shipment_items_quantity_positive'
  `);
  assert(quantityCheck.rows.length === 1, 'Positive shipment quantity check is missing');

  console.log(
    `PASS: applied ${directories.length} migrations and verified shipment tables, indexes, seed, and append-only audit`,
  );
} finally {
  await db.close();
}
