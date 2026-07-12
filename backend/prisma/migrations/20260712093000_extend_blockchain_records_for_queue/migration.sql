CREATE TYPE "BlockchainRecordStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "blockchain_records"
ADD COLUMN "certificate_id" UUID,
ADD COLUMN "batch_id" UUID,
ADD COLUMN "journey_id" UUID,
ADD COLUMN "status" "BlockchainRecordStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "error_message" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "blockchain_records_certificate_id_idx" ON "blockchain_records"("certificate_id");
CREATE INDEX "blockchain_records_batch_id_idx" ON "blockchain_records"("batch_id");
CREATE INDEX "blockchain_records_journey_id_idx" ON "blockchain_records"("journey_id");
CREATE INDEX "blockchain_records_status_idx" ON "blockchain_records"("status");
