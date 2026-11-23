-- Rows created before event_time existed received the migration execution time.
-- A business event cannot legitimately occur more than five minutes after the
-- append-only record was created, so only legacy rows matching that condition
-- are restored to their original recorded timestamp.
UPDATE "batch_journeys"
SET "event_time" = "created_at"
WHERE "event_time" > "created_at" + INTERVAL '5 minutes';
