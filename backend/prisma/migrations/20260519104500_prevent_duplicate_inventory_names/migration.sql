WITH duplicate_products AS (
  SELECT
    product_id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(item_name))
      ORDER BY product_id
    ) AS duplicate_rank
  FROM products
  WHERE deleted_at IS NULL
)
UPDATE products p
SET item_name = left(
  COALESCE(NULLIF(btrim(p.item_name), ''), 'Inventory item'),
  GREATEST(1, 150 - length(' (Duplicate ' || p.product_id || ')'))
) || ' (Duplicate ' || p.product_id || ')'
FROM duplicate_products d
WHERE p.product_id = d.product_id
  AND d.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "products_item_name_active_unique_idx"
ON "products" (lower(btrim("item_name")))
WHERE "deleted_at" IS NULL;
