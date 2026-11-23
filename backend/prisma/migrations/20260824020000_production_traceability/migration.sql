-- Production traceability: GS1-style parties, locations, immutable origin declarations,
-- and input/output batch genealogy.

CREATE TYPE "TraceabilityPartyType" AS ENUM (
  'PRODUCER', 'FARMER', 'SUPPLIER', 'PROCESSOR',
  'DISTRIBUTOR', 'RETAILER', 'CARRIER', 'OTHER'
);

CREATE TYPE "TraceabilityLocationType" AS ENUM (
  'FARM', 'FIELD', 'COLLECTION_POINT', 'PROCESSING_FACILITY',
  'PACKHOUSE', 'WAREHOUSE', 'DISTRIBUTION_CENTER', 'RETAIL_STORE', 'OTHER'
);

CREATE TABLE "traceability_parties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(250) NOT NULL,
  "type" "TraceabilityPartyType" NOT NULL,
  "gln" VARCHAR(13),
  "tax_code" VARCHAR(50),
  "phone" VARCHAR(30),
  "email" VARCHAR(254),
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3),
  "created_by_id" UUID NOT NULL,
  "verified_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "traceability_parties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "traceability_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "party_id" UUID NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(250) NOT NULL,
  "type" "TraceabilityLocationType" NOT NULL,
  "gln" VARCHAR(13),
  "address" TEXT NOT NULL,
  "ward" VARCHAR(150),
  "province" VARCHAR(150),
  "country_code" CHAR(2) NOT NULL DEFAULT 'VN',
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "traceability_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "batch_origin_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "party_id" UUID NOT NULL,
  "party_snapshot" JSONB NOT NULL,
  "location_id" UUID NOT NULL,
  "location_snapshot" JSONB NOT NULL,
  "source_lot_code" VARCHAR(150) NOT NULL,
  "country_code" CHAR(2) NOT NULL DEFAULT 'VN',
  "harvest_date" TIMESTAMP(3),
  "manufacture_date" TIMESTAMP(3),
  "production_method" TEXT,
  "evidence_urls" TEXT[] NOT NULL,
  "declaration_hash" VARCHAR(64) NOT NULL,
  "change_reason" TEXT,
  "declared_by_id" UUID NOT NULL,
  "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "batch_origin_declarations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "batch_origin_declarations_date_check"
    CHECK ("harvest_date" IS NOT NULL OR "manufacture_date" IS NOT NULL)
);

CREATE TABLE "batch_material_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "input_batch_id" UUID NOT NULL,
  "output_batch_id" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit" VARCHAR(30) NOT NULL,
  "process_reference" VARCHAR(150) NOT NULL,
  "evidence_urls" TEXT[] NOT NULL,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "batch_material_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "batch_material_links_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "batch_material_links_distinct_batches_check" CHECK ("input_batch_id" <> "output_batch_id")
);

CREATE UNIQUE INDEX "traceability_parties_code_key" ON "traceability_parties"("code");
CREATE UNIQUE INDEX "traceability_parties_gln_key" ON "traceability_parties"("gln");
CREATE INDEX "traceability_parties_type_is_verified_idx" ON "traceability_parties"("type", "is_verified");
CREATE INDEX "traceability_parties_created_by_id_idx" ON "traceability_parties"("created_by_id");

CREATE UNIQUE INDEX "traceability_locations_gln_key" ON "traceability_locations"("gln");
CREATE UNIQUE INDEX "traceability_locations_party_id_code_key" ON "traceability_locations"("party_id", "code");
CREATE INDEX "traceability_locations_party_id_type_idx" ON "traceability_locations"("party_id", "type");

CREATE UNIQUE INDEX "batch_origin_declarations_batch_id_revision_key" ON "batch_origin_declarations"("batch_id", "revision");
CREATE INDEX "batch_origin_declarations_party_id_source_lot_code_idx" ON "batch_origin_declarations"("party_id", "source_lot_code");
CREATE INDEX "batch_origin_declarations_location_id_idx" ON "batch_origin_declarations"("location_id");
CREATE INDEX "batch_origin_declarations_declared_at_idx" ON "batch_origin_declarations"("declared_at");

CREATE UNIQUE INDEX "batch_material_links_input_batch_id_output_batch_id_process_reference_key"
  ON "batch_material_links"("input_batch_id", "output_batch_id", "process_reference");
CREATE INDEX "batch_material_links_output_batch_id_idx" ON "batch_material_links"("output_batch_id");
CREATE INDEX "batch_material_links_created_at_idx" ON "batch_material_links"("created_at");

ALTER TABLE "traceability_parties"
  ADD CONSTRAINT "traceability_parties_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "traceability_parties_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "traceability_locations"
  ADD CONSTRAINT "traceability_locations_party_id_fkey"
  FOREIGN KEY ("party_id") REFERENCES "traceability_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "traceability_locations_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "batch_origin_declarations"
  ADD CONSTRAINT "batch_origin_declarations_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "batch_origin_declarations_party_id_fkey"
  FOREIGN KEY ("party_id") REFERENCES "traceability_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "batch_origin_declarations_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "traceability_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "batch_origin_declarations_declared_by_id_fkey"
  FOREIGN KEY ("declared_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "batch_material_links"
  ADD CONSTRAINT "batch_material_links_input_batch_id_fkey"
  FOREIGN KEY ("input_batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "batch_material_links_output_batch_id_fkey"
  FOREIGN KEY ("output_batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "batch_material_links_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_traceability_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is an append-only traceability ledger', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "batch_origin_declarations_append_only"
BEFORE UPDATE OR DELETE ON "batch_origin_declarations"
FOR EACH ROW EXECUTE FUNCTION prevent_traceability_ledger_mutation();

CREATE TRIGGER "batch_material_links_append_only"
BEFORE UPDATE OR DELETE ON "batch_material_links"
FOR EACH ROW EXECUTE FUNCTION prevent_traceability_ledger_mutation();
