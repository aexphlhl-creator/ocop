-- Rebuild inventory reservations from their authoritative ledgers:
--   1) ACTIVE checkout/order reservations
--   2) manual shipments that have not been handed over yet
-- Shipment rows at HANDED_OVER or later have already left physical inventory
-- under the production workflow and must not remain reserved.

DO $$
BEGIN
  IF EXISTS (
    WITH batch_allocations AS (
      SELECT
        b."id" AS batch_id,
        b."quantity" AS physical_quantity,
        COALESCE((
          SELECT SUM(r."quantity")
          FROM "order_item_batch_reservations" r
          WHERE r."batch_id" = b."id" AND r."status" = 'ACTIVE'
        ), 0) + COALESCE((
          SELECT SUM(si."quantity")
          FROM "shipment_items" si
          JOIN "shipments" s ON s."id" = si."shipment_id"
          WHERE si."batch_id" = b."id"
            AND si."order_item_id" IS NULL
            AND s."order_id" IS NULL
            AND s."status" IN ('DRAFT', 'ASSIGNED')
        ), 0) AS allocated_quantity
      FROM "inventory_batches" b
    )
    SELECT 1
    FROM batch_allocations
    WHERE allocated_quantity > physical_quantity
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile shipment reservations: a batch is over-allocated';
  END IF;

  IF EXISTS (
    WITH inventory_allocations AS (
      SELECT
        i."id" AS inventory_id,
        i."current_quantity",
        COALESCE((
          SELECT SUM(r."quantity")
          FROM "order_item_batch_reservations" r
          JOIN "inventory_batches" b ON b."id" = r."batch_id"
          WHERE b."inventory_id" = i."id" AND r."status" = 'ACTIVE'
        ), 0) + COALESCE((
          SELECT SUM(si."quantity")
          FROM "shipment_items" si
          JOIN "shipments" s ON s."id" = si."shipment_id"
          JOIN "inventory_batches" b ON b."id" = si."batch_id"
          WHERE b."inventory_id" = i."id"
            AND si."order_item_id" IS NULL
            AND s."order_id" IS NULL
            AND s."status" IN ('DRAFT', 'ASSIGNED')
        ), 0) AS allocated_quantity
      FROM "inventories" i
    )
    SELECT 1
    FROM inventory_allocations
    WHERE allocated_quantity > "current_quantity"
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile shipment reservations: inventory reserved quantity exceeds physical stock';
  END IF;
END $$;

WITH order_reserved AS (
  SELECT b."inventory_id", SUM(r."quantity")::integer AS quantity
  FROM "order_item_batch_reservations" r
  JOIN "inventory_batches" b ON b."id" = r."batch_id"
  WHERE r."status" = 'ACTIVE'
  GROUP BY b."inventory_id"
),
manual_shipment_reserved AS (
  SELECT b."inventory_id", SUM(si."quantity")::integer AS quantity
  FROM "shipment_items" si
  JOIN "shipments" s ON s."id" = si."shipment_id"
  JOIN "inventory_batches" b ON b."id" = si."batch_id"
  WHERE si."order_item_id" IS NULL
    AND s."order_id" IS NULL
    AND s."status" IN ('DRAFT', 'ASSIGNED')
  GROUP BY b."inventory_id"
),
expected AS (
  SELECT
    i."id" AS inventory_id,
    COALESCE(o.quantity, 0) + COALESCE(m.quantity, 0) AS quantity
  FROM "inventories" i
  LEFT JOIN order_reserved o ON o."inventory_id" = i."id"
  LEFT JOIN manual_shipment_reserved m ON m."inventory_id" = i."id"
)
UPDATE "inventories" i
SET "reserved_quantity" = expected.quantity,
    "updated_at" = CURRENT_TIMESTAMP
FROM expected
WHERE i."id" = expected.inventory_id
  AND i."reserved_quantity" IS DISTINCT FROM expected.quantity;
