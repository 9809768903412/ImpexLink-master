CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "payment_id" SERIAL PRIMARY KEY,
  "direction" VARCHAR(40) NOT NULL,
  "method" VARCHAR(50) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12, 2) NOT NULL,
  "credit_days" INTEGER NOT NULL DEFAULT 30,
  "due_date" DATE,
  "paid_at" TIMESTAMP(3),
  "reference_number" VARCHAR(120),
  "notes" TEXT,
  "client_id" INTEGER,
  "client_order_id" INTEGER,
  "supplier_id" INTEGER,
  "supplier_order_id" INTEGER,
  "created_by_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_transactions_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_transactions_client_order_id_fkey"
    FOREIGN KEY ("client_order_id") REFERENCES "client_orders"("client_order_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_transactions_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_transactions_supplier_order_id_fkey"
    FOREIGN KEY ("supplier_order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_transactions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "payment_transactions_direction_idx" ON "payment_transactions"("direction");
CREATE INDEX IF NOT EXISTS "payment_transactions_status_idx" ON "payment_transactions"("status");
CREATE INDEX IF NOT EXISTS "payment_transactions_client_id_idx" ON "payment_transactions"("client_id");
CREATE INDEX IF NOT EXISTS "payment_transactions_client_order_id_idx" ON "payment_transactions"("client_order_id");
CREATE INDEX IF NOT EXISTS "payment_transactions_supplier_id_idx" ON "payment_transactions"("supplier_id");
CREATE INDEX IF NOT EXISTS "payment_transactions_supplier_order_id_idx" ON "payment_transactions"("supplier_order_id");
CREATE INDEX IF NOT EXISTS "payment_transactions_created_by_id_idx" ON "payment_transactions"("created_by_id");
