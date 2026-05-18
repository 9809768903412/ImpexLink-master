ALTER TABLE "stock_transactions"
ADD COLUMN IF NOT EXISTS "supplier_id" INTEGER;

CREATE INDEX IF NOT EXISTS "stock_transactions_supplier_id_idx"
ON "stock_transactions"("supplier_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_transactions_supplier_id_fkey'
  ) THEN
    ALTER TABLE "stock_transactions"
    ADD CONSTRAINT "stock_transactions_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
