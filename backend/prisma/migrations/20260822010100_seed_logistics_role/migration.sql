INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'LOGISTICS',
  'Logistics staff scoped to batches assigned by warehouse managers',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
