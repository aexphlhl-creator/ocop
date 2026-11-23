-- Production lot lifecycle, independent QA role and exact warehouse lineage.

INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'QUALITY_ASSURANCE',
  'Independent QA/QC operator responsible for lot inspection and release',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description", "updated_at" = CURRENT_TIMESTAMP;

CREATE TYPE "BatchLifecycleStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'QUARANTINED',
  'QC_PASSED',
  'RELEASED',
  'REJECTED',
  'RECALLED',
  'CLOSED'
);

ALTER TABLE "inventory_batches"
  ADD COLUMN "declared_quantity" INTEGER,
  ADD COLUMN "lifecycle_status" "BatchLifecycleStatus",
  ADD COLUMN "declared_by_id" UUID,
  ADD COLUMN "declaration_idempotency_key" VARCHAR(100),
  ADD COLUMN "parent_batch_id" UUID,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "actual_received_at" TIMESTAMP(3),
  ADD COLUMN "inspected_at" TIMESTAMP(3),
  ADD COLUMN "released_at" TIMESTAMP(3),
  ADD COLUMN "rejected_at" TIMESTAMP(3);

UPDATE "inventory_batches"
SET
  "declared_quantity" = "initial_quantity",
  "declaration_idempotency_key" = 'legacy-' || "id"::text,
  "lifecycle_status" = CASE
    WHEN "quality_status" = 'FAILED' THEN 'REJECTED'::"BatchLifecycleStatus"
    ELSE 'QUARANTINED'::"BatchLifecycleStatus"
  END,
  "actual_received_at" = "received_date";

-- Historical PASSED flags are not evidence of independent QA/release.
-- Preserve historical quality values, but require a new documented release.
-- Never fabricate inspected_at/released_at/rejected_at from receipt dates.

ALTER TABLE "inventory_batches"
  ALTER COLUMN "declared_quantity" SET NOT NULL,
  ALTER COLUMN "declaration_idempotency_key" SET NOT NULL,
  ALTER COLUMN "lifecycle_status" SET NOT NULL,
  ALTER COLUMN "lifecycle_status" SET DEFAULT 'DRAFT';

ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_declared_by_id_fkey"
    FOREIGN KEY ("declared_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_batches_parent_batch_id_fkey"
    FOREIGN KEY ("parent_batch_id") REFERENCES "inventory_batches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_batches_quantity_nonnegative"
    CHECK ("quantity" >= 0),
  ADD CONSTRAINT "inventory_batches_declared_quantity_positive"
    CHECK ("declared_quantity" > 0);

CREATE UNIQUE INDEX "inventory_batches_inventory_id_batch_number_key"
ON "inventory_batches"("inventory_id", "batch_number");
CREATE UNIQUE INDEX "inventory_batches_declared_by_id_declaration_idempotency_key_key"
ON "inventory_batches"("declared_by_id", "declaration_idempotency_key");
CREATE INDEX "inventory_batches_lifecycle_status_idx"
ON "inventory_batches"("lifecycle_status");
CREATE INDEX "inventory_batches_declared_by_id_idx"
ON "inventory_batches"("declared_by_id");
CREATE INDEX "inventory_batches_parent_batch_id_idx"
ON "inventory_batches"("parent_batch_id");

ALTER TABLE "shipments"
  ADD COLUMN "destination_warehouse_id" UUID,
  ADD CONSTRAINT "shipments_destination_warehouse_id_fkey"
    FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "shipments_destination_warehouse_id_status_idx"
ON "shipments"("destination_warehouse_id", "status");

CREATE UNIQUE INDEX "product_reviews_user_id_product_id_key"
ON "product_reviews"("user_id", "product_id");

CREATE TABLE "batch_lifecycle_events" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "from_status" "BatchLifecycleStatus",
  "to_status" "BatchLifecycleStatus" NOT NULL,
  "actor_id" UUID NOT NULL,
  "event_time" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "note" TEXT,
  "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attachment_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "batch_lifecycle_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "batch_lifecycle_events_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "batch_lifecycle_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "batch_lifecycle_events_batch_id_idempotency_key_key"
ON "batch_lifecycle_events"("batch_id", "idempotency_key");
CREATE INDEX "batch_lifecycle_events_batch_id_event_time_idx"
ON "batch_lifecycle_events"("batch_id", "event_time");
CREATE INDEX "batch_lifecycle_events_actor_id_created_at_idx"
ON "batch_lifecycle_events"("actor_id", "created_at");

CREATE OR REPLACE FUNCTION prevent_batch_lifecycle_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'batch_lifecycle_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "batch_lifecycle_events_prevent_update"
BEFORE UPDATE ON "batch_lifecycle_events"
FOR EACH ROW EXECUTE FUNCTION prevent_batch_lifecycle_event_mutation();

CREATE TRIGGER "batch_lifecycle_events_prevent_delete"
BEFORE DELETE ON "batch_lifecycle_events"
FOR EACH ROW EXECUTE FUNCTION prevent_batch_lifecycle_event_mutation();
