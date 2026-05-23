CREATE TABLE IF NOT EXISTS "delivery_gps_locations" (
  "location_id" SERIAL NOT NULL,
  "delivery_id" INTEGER NOT NULL,
  "device_id" VARCHAR(120),
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "speed_kmph" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "satellites" INTEGER,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_gps_locations_pkey" PRIMARY KEY ("location_id")
);

CREATE INDEX IF NOT EXISTS "delivery_gps_locations_delivery_id_recorded_at_idx"
  ON "delivery_gps_locations"("delivery_id", "recorded_at");

CREATE INDEX IF NOT EXISTS "delivery_gps_locations_device_id_idx"
  ON "delivery_gps_locations"("device_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_gps_locations_delivery_id_fkey'
  ) THEN
    ALTER TABLE "delivery_gps_locations"
      ADD CONSTRAINT "delivery_gps_locations_delivery_id_fkey"
      FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
