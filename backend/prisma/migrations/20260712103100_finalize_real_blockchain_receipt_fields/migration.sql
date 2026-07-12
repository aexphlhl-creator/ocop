ALTER TABLE "blockchain_records"
ADD COLUMN IF NOT EXISTS "transaction_hash" TEXT,
ADD COLUMN IF NOT EXISTS "block_hash" TEXT,
ADD COLUMN IF NOT EXISTS "block_number" BIGINT,
ADD COLUMN IF NOT EXISTS "gas_used" BIGINT,
ADD COLUMN IF NOT EXISTS "wallet_address" TEXT,
ADD COLUMN IF NOT EXISTS "contract_address" TEXT,
ADD COLUMN IF NOT EXISTS "chain_id" INTEGER,
ADD COLUMN IF NOT EXISTS "explorer_url" TEXT,
ADD COLUMN IF NOT EXISTS "receipt" JSONB,
ADD COLUMN IF NOT EXISTS "confirmations" INTEGER,
ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3);

UPDATE "blockchain_records"
SET "status" = 'QUEUED'
WHERE "status" = 'PENDING';

UPDATE "blockchain_records"
SET "status" = 'CONFIRMED'
WHERE "status" = 'COMPLETED';

ALTER TABLE "blockchain_records"
ALTER COLUMN "status" SET DEFAULT 'QUEUED';

CREATE INDEX IF NOT EXISTS "blockchain_records_transaction_hash_idx"
ON "blockchain_records"("transaction_hash");
