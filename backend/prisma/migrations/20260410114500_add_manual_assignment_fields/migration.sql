ALTER TABLE "client_orders"
  ADD COLUMN IF NOT EXISTS "assigned_sales_agent_id" INTEGER;

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "assigned_delivery_guy_id" INTEGER;

ALTER TABLE "material_requests"
  ADD COLUMN IF NOT EXISTS "assigned_project_manager_id" INTEGER;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "assigned_pm_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_orders_assigned_sales_agent_id_fkey'
  ) THEN
    ALTER TABLE "client_orders"
      ADD CONSTRAINT "client_orders_assigned_sales_agent_id_fkey"
      FOREIGN KEY ("assigned_sales_agent_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_assigned_delivery_guy_id_fkey'
  ) THEN
    ALTER TABLE "deliveries"
      ADD CONSTRAINT "deliveries_assigned_delivery_guy_id_fkey"
      FOREIGN KEY ("assigned_delivery_guy_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_requests_assigned_project_manager_id_fkey'
  ) THEN
    ALTER TABLE "material_requests"
      ADD CONSTRAINT "material_requests_assigned_project_manager_id_fkey"
      FOREIGN KEY ("assigned_project_manager_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_assigned_pm_id_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_assigned_pm_id_fkey"
      FOREIGN KEY ("assigned_pm_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "deliveries"
SET "assigned_delivery_guy_id" = "assigned_driver_id"
WHERE "assigned_delivery_guy_id" IS NULL AND "assigned_driver_id" IS NOT NULL;

UPDATE "material_requests" mr
SET "assigned_project_manager_id" = p."assigned_pm_id"
FROM "projects" p
WHERE mr."project_id" = p."project_id"
  AND mr."assigned_project_manager_id" IS NULL
  AND p."assigned_pm_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "client_orders_assigned_sales_agent_id_idx"
  ON "client_orders"("assigned_sales_agent_id");

CREATE INDEX IF NOT EXISTS "deliveries_assigned_delivery_guy_id_idx"
  ON "deliveries"("assigned_delivery_guy_id");

CREATE INDEX IF NOT EXISTS "material_requests_assigned_project_manager_id_idx"
  ON "material_requests"("assigned_project_manager_id");

CREATE INDEX IF NOT EXISTS "projects_assigned_pm_id_idx"
  ON "projects"("assigned_pm_id");
