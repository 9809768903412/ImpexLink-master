ALTER TABLE "deliveries"
ADD COLUMN IF NOT EXISTS "delay_type" VARCHAR(40);

ALTER TABLE "deliveries"
ALTER COLUMN "eta" TYPE TIMESTAMP(3)
USING "eta"::timestamp;
