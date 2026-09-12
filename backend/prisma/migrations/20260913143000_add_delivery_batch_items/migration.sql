ALTER TABLE "client_orders"
ADD COLUMN IF NOT EXISTS "requirements_confirmed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "requirements_confirmed_by" INTEGER,
ADD COLUMN IF NOT EXISTS "coordination_notes" TEXT;

ALTER TABLE "deliveries"
ADD COLUMN IF NOT EXISTS "loaded_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "loaded_by" INTEGER;

CREATE TABLE IF NOT EXISTS "delivery_items" (
  "delivery_item_id" SERIAL PRIMARY KEY,
  "delivery_id" INTEGER NOT NULL,
  "client_order_item_id" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "delivery_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "delivery_items_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_items_client_order_item_id_fkey"
    FOREIGN KEY ("client_order_item_id") REFERENCES "client_order_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_items_delivery_id_client_order_item_id_key"
  ON "delivery_items"("delivery_id", "client_order_item_id");
CREATE INDEX IF NOT EXISTS "delivery_items_delivery_id_idx" ON "delivery_items"("delivery_id");
CREATE INDEX IF NOT EXISTS "delivery_items_client_order_item_id_idx" ON "delivery_items"("client_order_item_id");

INSERT INTO "delivery_items" ("delivery_id", "client_order_item_id", "quantity")
SELECT
  d."delivery_id",
  coi."item_id",
  FLOOR(coi."quantity"::numeric / GREATEST(d."batch_count", 1))::integer +
    CASE
      WHEN d."batch_number" <= MOD(coi."quantity", GREATEST(d."batch_count", 1)) THEN 1
      ELSE 0
    END
FROM "deliveries" d
JOIN "client_order_items" coi ON coi."client_order_id" = d."client_order_id"
WHERE d."deleted_at" IS NULL
  AND (
    FLOOR(coi."quantity"::numeric / GREATEST(d."batch_count", 1))::integer +
    CASE
      WHEN d."batch_number" <= MOD(coi."quantity", GREATEST(d."batch_count", 1)) THEN 1
      ELSE 0
    END
  ) > 0
ON CONFLICT ("delivery_id", "client_order_item_id") DO NOTHING;
