ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "receiver_name" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "receiver_address" TEXT,
  ADD COLUMN IF NOT EXISTS "receiver_contact_number" VARCHAR(50);
