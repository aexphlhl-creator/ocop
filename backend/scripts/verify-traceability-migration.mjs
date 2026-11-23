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
        'traceability_parties', 'traceability_locations',
        'batch_origin_declarations', 'batch_material_links'
      )
  `);
  assert(tables.rows.length === 4, 'Production traceability tables are incomplete');

  const indexes = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'traceability_parties_code_key',
        'traceability_locations_party_id_code_key',
        'batch_origin_declarations_batch_id_revision_key',
        'batch_material_links_input_batch_id_output_batch_id_process_reference_key'
      )
  `);
  assert(indexes.rows.length === 4, 'Traceability identity and revision indexes are incomplete');

  const triggers = await db.query(`
    SELECT DISTINCT event_object_table FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table IN ('batch_origin_declarations', 'batch_material_links')
  `);
  assert(triggers.rows.length === 2, 'Traceability append-only triggers are missing');

  const checks = await db.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_name IN (
        'batch_origin_declarations_date_check',
        'batch_material_links_quantity_check',
        'batch_material_links_distinct_batches_check'
      )
  `);
  assert(checks.rows.length === 3, 'Traceability data-quality checks are incomplete');

  console.log(
    `PASS: applied ${directories.length} migrations and verified traceability identity, genealogy, constraints, and append-only ledgers`,
  );
} finally {
  await db.close();
}
