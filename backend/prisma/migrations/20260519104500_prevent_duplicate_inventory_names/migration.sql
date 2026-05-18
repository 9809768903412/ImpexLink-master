CREATE UNIQUE INDEX IF NOT EXISTS "products_item_name_active_unique_idx"
ON "products" (lower("item_name"))
WHERE "deleted_at" IS NULL;
