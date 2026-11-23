-- Normalize login identifiers and make email uniqueness case-insensitive.
-- Abort instead of merging accounts when legacy duplicates are present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY LOWER(TRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce case-insensitive email uniqueness: duplicate accounts exist';
  END IF;
END $$;

UPDATE "users" SET "email" = LOWER(TRIM("email"));

CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (LOWER("email"));
