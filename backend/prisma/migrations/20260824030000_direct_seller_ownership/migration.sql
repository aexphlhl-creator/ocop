-- Replace the legacy Business ownership boundary with a direct Seller boundary.
-- The legacy columns and table are intentionally retained for rollback and audit.

ALTER TYPE "NotificationTarget" ADD VALUE IF NOT EXISTS 'SPECIFIC_SELLERS';

ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "seller_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "seller_id" UUID NOT NULL,
  "display_name" TEXT NOT NULL,
  "tax_code" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "description" TEXT,
  "industry" TEXT,
  "avatar_url" TEXT,
  "ward_id" UUID,
  "province_id" UUID,
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "legacy_business_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_profiles_seller_id_key" ON "seller_profiles"("seller_id");
CREATE UNIQUE INDEX "seller_profiles_tax_code_key" ON "seller_profiles"("tax_code");
CREATE UNIQUE INDEX "seller_profiles_legacy_business_id_key" ON "seller_profiles"("legacy_business_id");
CREATE INDEX "seller_profiles_province_id_idx" ON "seller_profiles"("province_id");
CREATE INDEX "seller_profiles_ward_id_idx" ON "seller_profiles"("ward_id");
CREATE INDEX "seller_profiles_is_verified_idx" ON "seller_profiles"("is_verified");

ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_ward_id_fkey"
  FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_province_id_fkey"
  FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_legacy_business_id_fkey"
  FOREIGN KEY ("legacy_business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Choose one deterministic legacy profile per seller. All domain records keep
-- their exact owner through businesses.user_id, even when a seller had >1 business.
WITH ranked_businesses AS (
  SELECT b.*,
         ROW_NUMBER() OVER (
           PARTITION BY b."user_id"
           ORDER BY b."is_verified" DESC, b."created_at" ASC, b."id" ASC
         ) AS rank
  FROM "businesses" b
  WHERE b."deleted_at" IS NULL
)
INSERT INTO "seller_profiles" (
  "seller_id", "display_name", "tax_code", "phone", "email", "address",
  "description", "industry", "avatar_url", "ward_id", "province_id",
  "is_verified", "legacy_business_id", "created_at", "updated_at"
)
SELECT
  u."id",
  COALESCE(rb."name", u."full_name"),
  rb."tax_code",
  COALESCE(rb."phone", u."phone"),
  COALESCE(rb."email", u."email"),
  rb."address",
  rb."description",
  rb."industry",
  rb."avatar_url",
  rb."ward_id",
  rb."province_id",
  COALESCE(rb."is_verified", false),
  rb."id",
  COALESCE(rb."created_at", u."created_at"),
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "roles" r ON r."id" = u."role_id"
LEFT JOIN ranked_businesses rb ON rb."user_id" = u."id" AND rb.rank = 1
WHERE r."name" = 'SELLER';

ALTER TABLE "products" ADD COLUMN "seller_id" UUID;
ALTER TABLE "orders" ADD COLUMN "seller_id" UUID;
ALTER TABLE "vouchers" ADD COLUMN "seller_id" UUID;
ALTER TABLE "ocop_upgrade_requests" ADD COLUMN "seller_id" UUID;
ALTER TABLE "warehouses" ADD COLUMN "seller_id" UUID;
ALTER TABLE "suppliers" ADD COLUMN "seller_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "seller_id" UUID;
ALTER TABLE "goods_receipts" ADD COLUMN "seller_id" UUID;

UPDATE "products" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "orders" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "vouchers" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "ocop_upgrade_requests" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "warehouses" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "suppliers" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "purchase_orders" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";
UPDATE "goods_receipts" target SET "seller_id" = source."user_id"
FROM "businesses" source WHERE target."business_id" = source."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "seller_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "orders" WHERE "seller_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "ocop_upgrade_requests" WHERE "seller_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "suppliers" WHERE "seller_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "purchase_orders" WHERE "seller_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "goods_receipts" WHERE "seller_id" IS NULL) THEN
    RAISE EXCEPTION 'Direct seller ownership backfill is incomplete';
  END IF;
END $$;

ALTER TABLE "products" ALTER COLUMN "seller_id" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "seller_id" SET NOT NULL;
ALTER TABLE "ocop_upgrade_requests" ALTER COLUMN "seller_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "seller_id" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "seller_id" SET NOT NULL;
ALTER TABLE "goods_receipts" ALTER COLUMN "seller_id" SET NOT NULL;

CREATE INDEX "products_seller_id_idx" ON "products"("seller_id");
CREATE INDEX "orders_seller_id_idx" ON "orders"("seller_id");
CREATE INDEX "vouchers_seller_id_idx" ON "vouchers"("seller_id");
CREATE INDEX "ocop_upgrade_requests_seller_id_idx" ON "ocop_upgrade_requests"("seller_id");
CREATE INDEX "warehouses_seller_id_idx" ON "warehouses"("seller_id");
CREATE UNIQUE INDEX "warehouses_name_seller_id_key" ON "warehouses"("name", "seller_id");
CREATE INDEX "suppliers_seller_id_idx" ON "suppliers"("seller_id");
CREATE INDEX "purchase_orders_seller_id_idx" ON "purchase_orders"("seller_id");
CREATE INDEX "goods_receipts_seller_id_idx" ON "goods_receipts"("seller_id");

ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ocop_upgrade_requests" ADD CONSTRAINT "ocop_upgrade_requests_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New writes no longer need a Business record. Legacy references remain nullable.
ALTER TABLE "products" ALTER COLUMN "business_id" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "business_id" DROP NOT NULL;
ALTER TABLE "ocop_upgrade_requests" ALTER COLUMN "business_id" DROP NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "business_id" DROP NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "business_id" DROP NOT NULL;
ALTER TABLE "goods_receipts" ALTER COLUMN "business_id" DROP NOT NULL;

ALTER TABLE "products" DROP CONSTRAINT "products_business_id_fkey";
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" DROP CONSTRAINT "orders_business_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vouchers" DROP CONSTRAINT "vouchers_business_id_fkey";
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ocop_upgrade_requests" DROP CONSTRAINT "ocop_upgrade_requests_business_id_fkey";
ALTER TABLE "ocop_upgrade_requests" ADD CONSTRAINT "ocop_upgrade_requests_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_business_id_fkey";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_business_id_fkey";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" DROP CONSTRAINT "goods_receipts_business_id_fkey";
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
