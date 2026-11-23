import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../prisma/migrations/', import.meta.url);
const target = '20260903010000_production_lot_lifecycle';
const db = new PGlite();
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
try {
  const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of directories.filter((name) => name < target)) {
    await db.exec(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
  }
  await db.exec(`
    INSERT INTO roles (id,name,updated_at) VALUES ('${id(1)}','SELLER',now());
    INSERT INTO users (id,email,password_hash,full_name,role_id,updated_at) VALUES ('${id(2)}','fixture@example.test','hash','Fixture','${id(1)}',now());
    INSERT INTO provinces (id,name,code,latitude,longitude,updated_at) VALUES ('${id(3)}','Fixture','FIX',1,1,now());
    INSERT INTO wards (id,name,province_id,latitude,longitude,updated_at) VALUES ('${id(4)}','Fixture','${id(3)}',1,1,now());
    INSERT INTO categories (id,name,slug,updated_at) VALUES ('${id(5)}','Fixture','fixture',now());
    INSERT INTO ocop_levels (id,level,title,updated_at) VALUES ('${id(6)}',4,'Fixture',now());
    INSERT INTO products (id,name,slug,description,price,unit,ocop_level_id,category_id,seller_id,ward_id,province_id,latitude,longitude,updated_at)
      VALUES ('${id(7)}','Fixture','fixture','Fixture',1,'box','${id(6)}','${id(5)}','${id(2)}','${id(4)}','${id(3)}',1,1,now());
    INSERT INTO warehouses (id,code,name,address,seller_id,updated_at) VALUES ('${id(8)}','FIX','Fixture','Fixture','${id(2)}',now());
    INSERT INTO inventories (id,warehouse_id,product_id,current_quantity,updated_at) VALUES ('${id(9)}','${id(8)}','${id(7)}',5,now());
    INSERT INTO inventory_batches (id,inventory_id,batch_number,quantity,initial_quantity,quality_status)
      VALUES ('${id(10)}','${id(9)}','LEGACY-PASSED',5,10,'PASSED');
  `);
  await db.exec(await readFile(new URL(`${target}/migration.sql`, root), 'utf8'));
  const { rows: [batch] } = await db.query(`SELECT * FROM inventory_batches WHERE id='${id(10)}'`);
  assert.equal(batch.lifecycle_status, 'QUARANTINED');
  assert.equal(batch.quality_status, 'PASSED', 'Historical quality must be preserved');
  assert.equal(batch.quantity, 5);
  assert.equal(batch.declared_quantity, 10);
  assert.equal(batch.inspected_at, null);
  assert.equal(batch.released_at, null);
  const { rows: roles } = await db.query("SELECT id FROM roles WHERE name='QUALITY_ASSURANCE'");
  assert.equal(roles.length, 1);
  await db.exec(`INSERT INTO batch_lifecycle_events (id,batch_id,idempotency_key,action,to_status,actor_id,event_time)
    VALUES ('${id(11)}','${id(10)}','fixture-key','FIXTURE','QUARANTINED','${id(2)}',now());`);
  await assert.rejects(db.exec(`UPDATE batch_lifecycle_events SET note='tampered' WHERE id='${id(11)}'`), /append-only/);
  await assert.rejects(db.exec(`DELETE FROM batch_lifecycle_events WHERE id='${id(11)}'`), /append-only/);
  await assert.rejects(db.exec(`INSERT INTO batch_lifecycle_events (id,batch_id,idempotency_key,action,to_status,actor_id,event_time)
    VALUES ('${id(12)}','${id(10)}','fixture-key','FIXTURE','QUARANTINED','${id(2)}',now());`), /unique/);
  console.log(`PASS: ${directories.length} migrations; legacy quarantine, no fabricated QA, QA role, append-only audit and idempotency constraint (${fileURLToPath(root)})`);
} finally { await db.close(); }
