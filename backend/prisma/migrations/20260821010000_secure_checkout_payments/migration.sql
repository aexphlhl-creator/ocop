-- Secure multi-shop checkout, inventory reservation and VNPay payment state.
-- This migration is intentionally forward-only: financial/audit rows must not be
-- dropped during an application rollback.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_FAILED';

CREATE TYPE "PaymentAggregateStatus" AS ENUM (
  'PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED',
  'RECONCILIATION_REQUIRED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'
);

CREATE TYPE "PaymentTransactionStatus" AS ENUM (
  'PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED',
  'RECONCILIATION_REQUIRED'
);

CREATE TYPE "PaymentProvider" AS ENUM ('NONE', 'VNPAY');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'DEDUCTED', 'RELEASED');
CREATE TYPE "GatewayAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL');

CREATE TABLE "payment_aggregates" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "PaymentAggregateStatus" NOT NULL DEFAULT 'PENDING',
  "payment_method" "PaymentMethod" NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'NONE',
  "reconciliation_reason" TEXT,
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_aggregates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_aggregates_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "payment_aggregates_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "payment_aggregates_method_provider_check" CHECK (
    ("payment_method" = 'COD' AND "provider" = 'NONE') OR
    ("payment_method" = 'VNPAY' AND "provider" = 'VNPAY')
  )
);

CREATE TABLE "payment_transactions" (
  "id" UUID NOT NULL,
  "payment_aggregate_id" UUID NOT NULL,
  "txn_ref" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "received_amount" DECIMAL(12,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "payment_url" TEXT NOT NULL,
  "gateway_create_date" VARCHAR(14) NOT NULL,
  "gateway_tx_no" VARCHAR(100),
  "response_code" VARCHAR(10),
  "transaction_status" VARCHAR(10),
  "raw_ipn_payload" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "processed_at" TIMESTAMP(3),
  "last_queried_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_transactions_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_transactions_received_amount_check" CHECK (
    "received_amount" IS NULL OR "received_amount" >= 0
  ),
  CONSTRAINT "payment_transactions_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "payment_transactions_gateway_create_date_check" CHECK (
    "gateway_create_date" ~ '^[0-9]{14}$'
  )
);

CREATE TABLE "payment_query_attempts" (
  "id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "request_id" VARCHAR(32) NOT NULL,
  "status" "GatewayAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "response_code" VARCHAR(10),
  "transaction_status" VARCHAR(10),
  "gateway_response" JSONB,
  "failure_reason" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_query_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_attempts" (
  "id" UUID NOT NULL,
  "payment_aggregate_id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "merchant_request_id" VARCHAR(32) NOT NULL,
  "gateway_refund_tx_no" VARCHAR(100),
  "refund_type" "RefundType" NOT NULL DEFAULT 'FULL',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "GatewayAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "response_code" VARCHAR(10),
  "transaction_status" VARCHAR(10),
  "gateway_response" JSONB,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "requested_by" VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_attempts_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "refund_attempts_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "refund_attempts_retry_count_check" CHECK ("retry_count" >= 0)
);

CREATE TABLE "order_item_batch_reservations" (
  "id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deducted_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  CONSTRAINT "order_item_batch_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_item_batch_reservations_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_item_batch_reservations_timestamps_check" CHECK (
    ("status" = 'ACTIVE' AND "deducted_at" IS NULL AND "released_at" IS NULL) OR
    ("status" = 'DEDUCTED' AND "deducted_at" IS NOT NULL AND "released_at" IS NULL) OR
    ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND "deducted_at" IS NULL)
  )
);

-- The conflict target must exist before the legacy backfill below runs.
CREATE UNIQUE INDEX "order_item_batch_reservations_order_item_id_batch_id_key"
  ON "order_item_batch_reservations"("order_item_id", "batch_id");

ALTER TABLE "orders" ADD COLUMN "payment_aggregate_id" UUID;
ALTER TABLE "stock_movements" ADD COLUMN "reservation_id" UUID;

-- Preserve legacy reservation intent before retiring the single-batch column.
INSERT INTO "order_item_batch_reservations" (
  "id", "order_item_id", "batch_id", "quantity", "status",
  "reserved_at", "deducted_at", "released_at"
)
SELECT
  gen_random_uuid(), oi."id", oi."reserved_batch_id", oi."quantity",
  CASE
    WHEN o."status" IN ('SHIPPED', 'DELIVERED', 'RETURNED') THEN 'DEDUCTED'::"ReservationStatus"
    WHEN o."status" = 'CANCELLED' THEN 'RELEASED'::"ReservationStatus"
    ELSE 'ACTIVE'::"ReservationStatus"
  END,
  oi."created_at",
  CASE WHEN o."status" IN ('SHIPPED', 'DELIVERED', 'RETURNED') THEN o."updated_at" END,
  CASE WHEN o."status" = 'CANCELLED' THEN o."updated_at" END
FROM "order_items" oi
JOIN "orders" o ON o."id" = oi."order_id"
WHERE oi."reserved_batch_id" IS NOT NULL
ON CONFLICT ("order_item_id", "batch_id") DO NOTHING;

ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_reserved_batch_id_fkey";
DROP INDEX IF EXISTS "order_items_reserved_batch_id_idx";
ALTER TABLE "order_items" DROP COLUMN "reserved_batch_id";

CREATE UNIQUE INDEX "payment_aggregates_user_id_idempotency_key_key"
  ON "payment_aggregates"("user_id", "idempotency_key");
CREATE INDEX "payment_aggregates_idempotency_key_idx"
  ON "payment_aggregates"("idempotency_key");
CREATE INDEX "payment_aggregates_status_updated_at_idx"
  ON "payment_aggregates"("status", "updated_at");

CREATE UNIQUE INDEX "payment_transactions_txn_ref_key"
  ON "payment_transactions"("txn_ref");
CREATE UNIQUE INDEX "payment_transactions_gateway_tx_no_key"
  ON "payment_transactions"("gateway_tx_no");
CREATE INDEX "payment_transactions_payment_aggregate_id_idx"
  ON "payment_transactions"("payment_aggregate_id");
CREATE INDEX "payment_transactions_status_expires_at_idx"
  ON "payment_transactions"("status", "expires_at");
CREATE UNIQUE INDEX "payment_transactions_one_pending_per_aggregate_idx"
  ON "payment_transactions"("payment_aggregate_id")
  WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "payment_query_attempts_request_id_key"
  ON "payment_query_attempts"("request_id");
CREATE INDEX "payment_query_attempts_transaction_id_created_at_idx"
  ON "payment_query_attempts"("transaction_id", "created_at");

CREATE UNIQUE INDEX "refund_attempts_merchant_request_id_key"
  ON "refund_attempts"("merchant_request_id");
CREATE UNIQUE INDEX "refund_attempts_gateway_refund_tx_no_key"
  ON "refund_attempts"("gateway_refund_tx_no");
CREATE UNIQUE INDEX "refund_attempts_payment_aggregate_id_idempotency_key_key"
  ON "refund_attempts"("payment_aggregate_id", "idempotency_key");
CREATE UNIQUE INDEX "refund_attempts_one_pending_per_aggregate_idx"
  ON "refund_attempts"("payment_aggregate_id")
  WHERE "status" = 'PENDING';
CREATE INDEX "refund_attempts_transaction_id_idx"
  ON "refund_attempts"("transaction_id");
CREATE INDEX "refund_attempts_status_next_retry_at_idx"
  ON "refund_attempts"("status", "next_retry_at");

CREATE INDEX "order_item_batch_reservations_batch_id_status_idx"
  ON "order_item_batch_reservations"("batch_id", "status");
CREATE INDEX "order_item_batch_reservations_order_item_id_status_idx"
  ON "order_item_batch_reservations"("order_item_id", "status");

CREATE INDEX "orders_payment_aggregate_id_idx"
  ON "orders"("payment_aggregate_id");
CREATE UNIQUE INDEX "stock_movements_reservation_id_key"
  ON "stock_movements"("reservation_id");

ALTER TABLE "payment_aggregates"
  ADD CONSTRAINT "payment_aggregates_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_payment_aggregate_id_fkey"
  FOREIGN KEY ("payment_aggregate_id") REFERENCES "payment_aggregates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_query_attempts"
  ADD CONSTRAINT "payment_query_attempts_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_payment_aggregate_id_fkey"
  FOREIGN KEY ("payment_aggregate_id") REFERENCES "payment_aggregates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_item_batch_reservations"
  ADD CONSTRAINT "order_item_batch_reservations_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_item_batch_reservations"
  ADD CONSTRAINT "order_item_batch_reservations_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_aggregate_id_fkey"
  FOREIGN KEY ("payment_aggregate_id") REFERENCES "payment_aggregates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "order_item_batch_reservations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
