INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'WAREHOUSE_MANAGER',
  'Warehouse manager scoped to assigned warehouses',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
