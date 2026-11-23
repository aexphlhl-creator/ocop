ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'LOGISTICS';

CREATE TYPE "LogisticsAssignmentStatus" AS ENUM (
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED'
);

CREATE TABLE "batch_logistics_assignments" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "logistics_user_id" UUID NOT NULL,
  "assigned_by_id" UUID NOT NULL,
  "carrier_name" VARCHAR(200) NOT NULL,
  "tracking_code" VARCHAR(200) NOT NULL,
  "status" "LogisticsAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "batch_logistics_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "batch_logistics_assignments_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "batch_logistics_assignments_logistics_user_id_fkey"
    FOREIGN KEY ("logistics_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "batch_logistics_assignments_assigned_by_id_fkey"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "batch_logistics_assignments_batch_id_idx"
ON "batch_logistics_assignments"("batch_id");

CREATE INDEX "batch_logistics_assignments_logistics_user_id_status_idx"
ON "batch_logistics_assignments"("logistics_user_id", "status");

CREATE INDEX "batch_logistics_assignments_tracking_code_idx"
ON "batch_logistics_assignments"("tracking_code");

CREATE UNIQUE INDEX "batch_logistics_assignments_one_active_per_batch_idx"
ON "batch_logistics_assignments"("batch_id")
WHERE "status" IN ('ASSIGNED', 'IN_TRANSIT');
