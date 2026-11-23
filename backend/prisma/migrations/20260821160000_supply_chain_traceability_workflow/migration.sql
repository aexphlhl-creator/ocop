ALTER TABLE "batch_journeys"
ADD COLUMN "event_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "reference_code" TEXT,
ADD COLUMN "carrier_name" TEXT,
ADD COLUMN "recipient_name" TEXT;

CREATE INDEX "batch_journeys_batch_id_event_time_idx"
ON "batch_journeys"("batch_id", "event_time");
