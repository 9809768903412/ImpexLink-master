ALTER TABLE "deliveries"
ADD COLUMN IF NOT EXISTS "assigned_driver_id" INTEGER;

CREATE INDEX IF NOT EXISTS "deliveries_assigned_driver_id_idx"
ON "deliveries"("assigned_driver_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deliveries_assigned_driver_id_fkey'
  ) THEN
    ALTER TABLE "deliveries"
    ADD CONSTRAINT "deliveries_assigned_driver_id_fkey"
    FOREIGN KEY ("assigned_driver_id") REFERENCES "users"("user_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
