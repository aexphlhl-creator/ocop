import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationRoot = path.resolve(scriptDirectory, '..', 'prisma', 'migrations');
const targetMigration = '20260824030000_direct_seller_ownership';

const ids = {
  role: '10000000-0000-4000-8000-000000000001',
  seller: '10000000-0000-4000-8000-000000000002',
  province: '10000000-0000-4000-8000-000000000003',
  ward: '10000000-0000-4000-8000-000000000004',
  businessOld: '10000000-0000-4000-8000-000000000005',
  businessVerified: '10000000-0000-4000-8000-000000000006',
  category: '10000000-0000-4000-8000-000000000007',
  level: '10000000-0000-4000-8000-000000000008',
  product: '10000000-0000-4000-8000-000000000009',
  order: '10000000-0000-4000-8000-000000000010',
  voucher: '10000000-0000-4000-8000-000000000011',
  upgrade: '10000000-0000-4000-8000-000000000012',
  warehouse: '10000000-0000-4000-8000-000000000013',
  supplier: '10000000-0000-4000-8000-000000000014',
  purchaseOrder: '10000000-0000-4000-8000-000000000015',
  receipt: '10000000-0000-4000-8000-000000000016',
  directSeller: '10000000-0000-4000-8000-000000000017',
  directProduct: '10000000-0000-4000-8000-000000000018',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const db = new PGlite();
try {
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert(directories.includes(targetMigration), `Missing ${targetMigration}`);

  for (const directory of directories.filter((name) => name < targetMigration)) {
    await db.exec(await readFile(path.join(migrationRoot, directory, 'migration.sql'), 'utf8'));
  }

  await db.exec(`
    INSERT INTO "roles" ("id", "name", "updated_at")
    VALUES ('${ids.role}', 'SELLER', CURRENT_TIMESTAMP);
    INSERT INTO "users" ("id", "email", "password_hash", "full_name", "role_id", "updated_at")
    VALUES ('${ids.seller}', 'legacy-seller@example.test', 'hash', 'Legacy Seller', '${ids.role}', CURRENT_TIMESTAMP);
    INSERT INTO "provinces" ("id", "name", "code", "latitude", "longitude", "updated_at")
    VALUES ('${ids.province}', 'Hà Nội', 'TEST-01', 21.02, 105.84, CURRENT_TIMESTAMP);
    INSERT INTO "wards" ("id", "name", "province_id", "latitude", "longitude", "updated_at")
    VALUES ('${ids.ward}', 'Phường thử nghiệm', '${ids.province}', 21.02, 105.84, CURRENT_TIMESTAMP);
    INSERT INTO "businesses" ("id", "name", "tax_code", "address", "user_id", "ward_id", "province_id", "is_verified", "created_at", "updated_at")
    VALUES
      ('${ids.businessOld}', 'Hồ sơ cũ', 'TEST-TAX-OLD', 'Địa chỉ cũ', '${ids.seller}', '${ids.ward}', '${ids.province}', false, '2025-01-01', CURRENT_TIMESTAMP),
      ('${ids.businessVerified}', 'Gian hàng đã xác minh', 'TEST-TAX-VERIFIED', 'Địa chỉ chuẩn', '${ids.seller}', '${ids.ward}', '${ids.province}', true, '2026-01-01', CURRENT_TIMESTAMP);
    INSERT INTO "categories" ("id", "name", "slug", "updated_at")
    VALUES ('${ids.category}', 'Kiểm thử', 'kiem-thu', CURRENT_TIMESTAMP);
    INSERT INTO "ocop_levels" ("id", "level", "title", "updated_at")
    VALUES ('${ids.level}', 4, '4 sao', CURRENT_TIMESTAMP);
    INSERT INTO "products" ("id", "name", "slug", "description", "price", "unit", "ocop_level_id", "category_id", "business_id", "ward_id", "province_id", "latitude", "longitude", "updated_at")
    VALUES ('${ids.product}', 'Sản phẩm legacy', 'san-pham-legacy', 'Fixture', 10000, 'hộp', '${ids.level}', '${ids.category}', '${ids.businessOld}', '${ids.ward}', '${ids.province}', 21.02, 105.84, CURRENT_TIMESTAMP);
    INSERT INTO "orders" ("id", "user_id", "business_id", "total_amount", "shipping_address", "phone", "updated_at")
    VALUES ('${ids.order}', '${ids.seller}', '${ids.businessOld}', 10000, 'Địa chỉ nhận', '0900000000', CURRENT_TIMESTAMP);
    INSERT INTO "vouchers" ("id", "code", "discount_type", "discount_value", "start_date", "end_date", "business_id", "updated_at")
    VALUES ('${ids.voucher}', 'SELLER-MIGRATION', 'FIXED_AMOUNT', 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day', '${ids.businessOld}', CURRENT_TIMESTAMP);
    INSERT INTO "ocop_upgrade_requests" ("id", "product_id", "current_level_id", "target_level_id", "business_id", "document_urls", "updated_at")
    VALUES ('${ids.upgrade}', '${ids.product}', '${ids.level}', '${ids.level}', '${ids.businessOld}', ARRAY[]::TEXT[], CURRENT_TIMESTAMP);
    INSERT INTO "warehouses" ("id", "code", "name", "address", "business_id", "updated_at")
    VALUES ('${ids.warehouse}', 'WH-MIGRATION', 'Kho migration', 'Hà Nội', '${ids.businessOld}', CURRENT_TIMESTAMP);
    INSERT INTO "suppliers" ("id", "code", "name", "business_id", "updated_at")
    VALUES ('${ids.supplier}', 'SUP-MIGRATION', 'Nhà cung cấp migration', '${ids.businessOld}', CURRENT_TIMESTAMP);
    INSERT INTO "purchase_orders" ("id", "code", "supplier_id", "warehouse_id", "business_id", "updated_at")
    VALUES ('${ids.purchaseOrder}', 'PO-MIGRATION', '${ids.supplier}', '${ids.warehouse}', '${ids.businessOld}', CURRENT_TIMESTAMP);
    INSERT INTO "goods_receipts" ("id", "code", "purchase_order_id", "warehouse_id", "business_id", "received_by_id")
    VALUES ('${ids.receipt}', 'GR-MIGRATION', '${ids.purchaseOrder}', '${ids.warehouse}', '${ids.businessOld}', '${ids.seller}');
  `);

  for (const directory of directories.filter((name) => name >= targetMigration)) {
    await db.exec(await readFile(path.join(migrationRoot, directory, 'migration.sql'), 'utf8'));
  }

  const profile = await db.query(`SELECT * FROM "seller_profiles" WHERE "seller_id" = '${ids.seller}'`);
  assert(profile.rows.length === 1, 'SellerProfile backfill must be one-to-one');
  assert(profile.rows[0].display_name === 'Gian hàng đã xác minh', 'Backfill did not select the deterministic verified profile');
  assert(profile.rows[0].legacy_business_id === ids.businessVerified, 'Legacy profile reference is incorrect');

  for (const table of ['products', 'orders', 'vouchers', 'ocop_upgrade_requests', 'warehouses', 'suppliers', 'purchase_orders', 'goods_receipts']) {
    const ownership = await db.query(`SELECT "seller_id" FROM "${table}" LIMIT 1`);
    assert(ownership.rows[0]?.seller_id === ids.seller, `${table}.seller_id backfill is incorrect`);
  }

  const requiredColumns = await db.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'seller_id' AND is_nullable = 'NO'
      AND table_name IN ('products', 'orders', 'ocop_upgrade_requests', 'suppliers', 'purchase_orders', 'goods_receipts')
  `);
  assert(requiredColumns.rows.length === 6, 'Required direct Seller columns are not all NOT NULL');

  const legacyColumns = await db.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'business_id' AND is_nullable = 'YES'
      AND table_name IN ('products', 'orders', 'vouchers', 'ocop_upgrade_requests', 'warehouses', 'suppliers', 'purchase_orders', 'goods_receipts')
  `);
  assert(legacyColumns.rows.length === 8, 'Legacy Business references must be nullable during compatibility window');

  const restrictFks = await db.query(`
    SELECT constraint_name FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
      AND constraint_name IN (
        'products_seller_id_fkey', 'orders_seller_id_fkey', 'vouchers_seller_id_fkey',
        'ocop_upgrade_requests_seller_id_fkey', 'warehouses_seller_id_fkey',
        'suppliers_seller_id_fkey', 'purchase_orders_seller_id_fkey', 'goods_receipts_seller_id_fkey'
      )
  `);
  assert(restrictFks.rows.length === 8, 'Seller-owned operational history is not protected by RESTRICT');

  await db.exec(`
    INSERT INTO "users" ("id", "email", "password_hash", "full_name", "role_id", "updated_at")
    VALUES ('${ids.directSeller}', 'direct-seller@example.test', 'hash', 'Direct Seller', '${ids.role}', CURRENT_TIMESTAMP);
    INSERT INTO "seller_profiles" ("seller_id", "display_name") VALUES ('${ids.directSeller}', 'Direct Seller Shop');
    INSERT INTO "products" ("id", "name", "slug", "description", "price", "unit", "ocop_level_id", "category_id", "seller_id", "ward_id", "province_id", "latitude", "longitude", "updated_at")
    VALUES ('${ids.directProduct}', 'Sản phẩm trực tiếp', 'san-pham-truc-tiep', 'Fixture', 12000, 'hộp', '${ids.level}', '${ids.category}', '${ids.directSeller}', '${ids.ward}', '${ids.province}', 21.02, 105.84, CURRENT_TIMESTAMP);
    DELETE FROM "businesses" WHERE "user_id" = '${ids.seller}';
  `);
  const preserved = await db.query(`SELECT "seller_id", "business_id" FROM "products" WHERE "id" = '${ids.product}'`);
  assert(preserved.rows[0].seller_id === ids.seller && preserved.rows[0].business_id === null, 'Deleting legacy Business damaged direct ownership');
  const direct = await db.query(`SELECT "seller_id", "business_id" FROM "products" WHERE "id" = '${ids.directProduct}'`);
  assert(direct.rows[0].seller_id === ids.directSeller && direct.rows[0].business_id === null, 'Direct Seller write without Business failed');

  console.log(`PASS: applied ${directories.length} migrations and verified deterministic SellerProfile backfill, direct ownership, history protection, and Business-free writes`);
} finally {
  await db.close();
}
