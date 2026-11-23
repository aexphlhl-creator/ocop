-- Production shipment domain. Batch journeys remain as immutable provenance;
-- transport execution is now tracked per shipment so a batch can be split.
CREATE TYPE "LogisticsOrganizationType" AS ENUM ('INTERNAL', 'THIRD_PARTY');
CREATE TYPE "ShipmentRouteType" AS ENUM (
  'DIRECT_TO_CUSTOMER',
  'VIA_DISTRIBUTOR',
  'VIA_RETAIL',
  'INTERNAL_TRANSFER'
);
CREATE TYPE "ShipmentStatus" AS ENUM (
  'DRAFT',
  'ASSIGNED',
  'HANDED_OVER',
  'IN_TRANSIT',
  'AT_DISTRIBUTOR',
  'AT_RETAIL',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING',
  'RETURNED',
  'CANCELLED'
);
CREATE TYPE "ShipmentAssignmentStatus" AS ENUM (
  'ASSIGNED',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED'
);
CREATE TYPE "ShipmentEventType" AS ENUM (
  'CREATED',
  'ASSIGNED',
  'REASSIGNED',
  'HANDED_OVER',
  'PICKED_UP',
  'ARRIVED_DISTRIBUTOR',
  'ARRIVED_RETAIL',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'DELIVERY_RETRIED',
  'RETURN_STARTED',
  'RETURNED',
  'CANCELLED'
);
CREATE TYPE "ShipmentEventSource" AS ENUM ('INTERNAL', 'CARRIER_WEBHOOK');
CREATE TYPE "CarrierWebhookProcessingStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');

CREATE TABLE "logistics_organizations" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "type" "LogisticsOrganizationType" NOT NULL DEFAULT 'THIRD_PARTY',
  "provider_code" VARCHAR(50),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "logistics_organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "logistics_organizations_code_key"
ON "logistics_organizations"("code");
CREATE UNIQUE INDEX "logistics_organizations_provider_code_key"
ON "logistics_organizations"("provider_code");

CREATE TABLE "logistics_organization_members" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "logistics_organization_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_organization_members_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "logistics_organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_organization_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "logistics_organization_members_organization_id_user_id_key"
ON "logistics_organization_members"("organization_id", "user_id");
CREATE INDEX "logistics_organization_members_user_id_is_active_idx"
ON "logistics_organization_members"("user_id", "is_active");

CREATE TABLE "shipments" (
  "id" UUID NOT NULL,
  "shipment_number" VARCHAR(50) NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "order_id" UUID,
  "origin_warehouse_id" UUID NOT NULL,
  "carrier_organization_id" UUID NOT NULL,
  "route_type" "ShipmentRouteType" NOT NULL,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
  "tracking_code" VARCHAR(200),
  "destination_name" VARCHAR(200) NOT NULL,
  "destination_address" TEXT NOT NULL,
  "destination_phone" VARCHAR(30),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID NOT NULL,
  "cancelled_at" TIMESTAMP(3),
  "cancellation_reason" TEXT,
  "handed_over_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipments_origin_warehouse_id_fkey"
    FOREIGN KEY ("origin_warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipments_carrier_organization_id_fkey"
    FOREIGN KEY ("carrier_organization_id") REFERENCES "logistics_organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shipments_shipment_number_key" ON "shipments"("shipment_number");
CREATE UNIQUE INDEX "shipments_created_by_id_idempotency_key_key"
ON "shipments"("created_by_id", "idempotency_key");
CREATE UNIQUE INDEX "shipments_carrier_organization_id_tracking_code_key"
ON "shipments"("carrier_organization_id", "tracking_code");
CREATE INDEX "shipments_origin_warehouse_id_status_idx"
ON "shipments"("origin_warehouse_id", "status");
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");
CREATE INDEX "shipments_status_updated_at_idx" ON "shipments"("status", "updated_at");

CREATE TABLE "shipment_items" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "order_item_id" UUID,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_items_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shipment_items_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipment_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipment_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE INDEX "shipment_items_shipment_id_idx" ON "shipment_items"("shipment_id");
CREATE INDEX "shipment_items_batch_id_idx" ON "shipment_items"("batch_id");
CREATE INDEX "shipment_items_order_item_id_idx" ON "shipment_items"("order_item_id");

CREATE TABLE "shipment_assignments" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "logistics_user_id" UUID NOT NULL,
  "assigned_by_id" UUID NOT NULL,
  "status" "ShipmentAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignment_reason" TEXT,
  "cancellation_reason" TEXT,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipment_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_assignments_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shipment_assignments_logistics_user_id_fkey"
    FOREIGN KEY ("logistics_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "shipment_assignments_assigned_by_id_fkey"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "shipment_assignments_shipment_id_status_idx"
ON "shipment_assignments"("shipment_id", "status");
CREATE INDEX "shipment_assignments_logistics_user_id_status_idx"
ON "shipment_assignments"("logistics_user_id", "status");
CREATE UNIQUE INDEX "shipment_assignments_one_active_per_shipment_idx"
ON "shipment_assignments"("shipment_id")
WHERE "status" IN ('ASSIGNED', 'IN_TRANSIT');

CREATE TABLE "shipment_events" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "event_type" "ShipmentEventType" NOT NULL,
  "source" "ShipmentEventSource" NOT NULL DEFAULT 'INTERNAL',
  "from_status" "ShipmentStatus",
  "to_status" "ShipmentStatus" NOT NULL,
  "actor_id" UUID,
  "event_time" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "recipient_name" VARCHAR(200),
  "failure_reason" TEXT,
  "note" TEXT,
  "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attachment_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "ip_address" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_events_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shipment_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shipment_events_shipment_id_idempotency_key_key"
ON "shipment_events"("shipment_id", "idempotency_key");
CREATE INDEX "shipment_events_shipment_id_event_time_idx"
ON "shipment_events"("shipment_id", "event_time");
CREATE INDEX "shipment_events_event_type_created_at_idx"
ON "shipment_events"("event_type", "created_at");

CREATE TABLE "carrier_webhook_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "external_event_id" VARCHAR(100) NOT NULL,
  "tracking_code" VARCHAR(200) NOT NULL,
  "payload_hash" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "signature_valid" BOOLEAN NOT NULL,
  "status" "CarrierWebhookProcessingStatus" NOT NULL,
  "error_message" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "carrier_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "carrier_webhook_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "logistics_organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "carrier_webhook_events_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "carrier_webhook_events_organization_id_external_event_id_key"
ON "carrier_webhook_events"("organization_id", "external_event_id");
CREATE INDEX "carrier_webhook_events_tracking_code_received_at_idx"
ON "carrier_webhook_events"("tracking_code", "received_at");
CREATE INDEX "carrier_webhook_events_shipment_id_received_at_idx"
ON "carrier_webhook_events"("shipment_id", "received_at");

-- Seed an internal carrier and attach existing LOGISTICS users so the migration
-- is deployable without manual repair.
INSERT INTO "logistics_organizations"
  ("id", "code", "name", "type", "provider_code", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'OCOP_INTERNAL', 'Đội vận chuyển nội bộ OCOP', 'INTERNAL', 'INTERNAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "logistics_organization_members"
  ("id", "organization_id", "user_id", "is_active", "created_at", "updated_at")
SELECT
  gen_random_uuid(), organization."id", users."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" users
JOIN "roles" roles ON roles."id" = users."role_id"
CROSS JOIN LATERAL (
  SELECT "id" FROM "logistics_organizations" WHERE "code" = 'OCOP_INTERNAL'
) organization
WHERE roles."name" = 'LOGISTICS'
ON CONFLICT ("organization_id", "user_id") DO NOTHING;

-- Preserve existing MVP assignments as legacy shipments. This is deliberately
-- conservative: quantity is historical batch quantity because the old model
-- did not retain shipment allocation quantities.
INSERT INTO "shipments" (
  "id", "shipment_number", "idempotency_key", "origin_warehouse_id",
  "carrier_organization_id", "route_type", "status", "tracking_code",
  "destination_name", "destination_address", "created_by_id",
  "cancelled_at", "handed_over_at", "delivered_at", "created_at", "updated_at"
)
SELECT
  assignment."id",
  'LEGACY-' || UPPER(SUBSTRING(REPLACE(assignment."id"::TEXT, '-', '') FROM 1 FOR 12)),
  'legacy-migration-' || assignment."id"::TEXT,
  inventory."warehouse_id",
  organization."id",
  'DIRECT_TO_CUSTOMER',
  CASE assignment."status"::TEXT
    WHEN 'ASSIGNED' THEN 'ASSIGNED'::"ShipmentStatus"
    WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT'::"ShipmentStatus"
    WHEN 'DELIVERED' THEN 'DELIVERED'::"ShipmentStatus"
    ELSE 'CANCELLED'::"ShipmentStatus"
  END,
  assignment."tracking_code",
  'Điểm nhận lịch sử',
  warehouse."address",
  assignment."assigned_by_id",
  assignment."cancelled_at",
  assignment."assigned_at",
  assignment."delivered_at",
  assignment."created_at",
  assignment."updated_at"
FROM "batch_logistics_assignments" assignment
JOIN "inventory_batches" batch ON batch."id" = assignment."batch_id"
JOIN "inventories" inventory ON inventory."id" = batch."inventory_id"
JOIN "warehouses" warehouse ON warehouse."id" = inventory."warehouse_id"
CROSS JOIN LATERAL (
  SELECT "id" FROM "logistics_organizations" WHERE "code" = 'OCOP_INTERNAL'
) organization
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "shipment_items" ("id", "shipment_id", "batch_id", "quantity", "created_at")
SELECT gen_random_uuid(), assignment."id", assignment."batch_id",
       GREATEST(batch."initial_quantity", 1), assignment."created_at"
FROM "batch_logistics_assignments" assignment
JOIN "inventory_batches" batch ON batch."id" = assignment."batch_id"
ON CONFLICT DO NOTHING;

INSERT INTO "shipment_assignments" (
  "id", "shipment_id", "logistics_user_id", "assigned_by_id", "status",
  "assignment_reason", "cancellation_reason", "assigned_at", "started_at",
  "completed_at", "cancelled_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), assignment."id", assignment."logistics_user_id",
  assignment."assigned_by_id",
  CASE assignment."status"::TEXT
    WHEN 'ASSIGNED' THEN 'ASSIGNED'::"ShipmentAssignmentStatus"
    WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT'::"ShipmentAssignmentStatus"
    WHEN 'DELIVERED' THEN 'COMPLETED'::"ShipmentAssignmentStatus"
    ELSE 'CANCELLED'::"ShipmentAssignmentStatus"
  END,
  'Dữ liệu chuyển đổi từ luồng batch MVP',
  CASE WHEN assignment."status"::TEXT = 'CANCELLED' THEN 'Dữ liệu legacy đã hủy' END,
  assignment."assigned_at", assignment."started_at", assignment."delivered_at",
  assignment."cancelled_at", assignment."created_at", assignment."updated_at"
FROM "batch_logistics_assignments" assignment;

INSERT INTO "shipment_events" (
  "id", "shipment_id", "idempotency_key", "event_type", "source",
  "from_status", "to_status", "actor_id", "event_time", "note", "metadata", "created_at"
)
SELECT
  gen_random_uuid(), assignment."id", 'legacy-import', 'CREATED', 'INTERNAL', NULL,
  shipment."status", assignment."assigned_by_id", assignment."created_at",
  'Bản ghi được nhập từ mô hình BatchLogisticsAssignment cũ',
  jsonb_build_object('legacyAssignmentId', assignment."id"), assignment."created_at"
FROM "batch_logistics_assignments" assignment
JOIN "shipments" shipment ON shipment."id" = assignment."id"
ON CONFLICT ("shipment_id", "idempotency_key") DO NOTHING;

-- Shipment events are an append-only audit ledger. Corrections must be added as
-- a new compensating event, never by rewriting history.
CREATE OR REPLACE FUNCTION prevent_shipment_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'shipment_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shipment_events_prevent_update"
BEFORE UPDATE ON "shipment_events"
FOR EACH ROW EXECUTE FUNCTION prevent_shipment_event_mutation();

CREATE TRIGGER "shipment_events_prevent_delete"
BEFORE DELETE ON "shipment_events"
FOR EACH ROW EXECUTE FUNCTION prevent_shipment_event_mutation();
