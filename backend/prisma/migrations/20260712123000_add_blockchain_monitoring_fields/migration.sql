ALTER TABLE "blockchain_records"
ADD COLUMN IF NOT EXISTS "last_checked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "confirmation_latency_ms" INTEGER,
ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "blockchain_records_last_checked_at_idx" ON "blockchain_records"("last_checked_at");
