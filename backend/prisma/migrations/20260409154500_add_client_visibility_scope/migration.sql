DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientVisibilityScope') THEN
    CREATE TYPE "ClientVisibilityScope" AS ENUM ('COMPANY', 'USER');
  END IF;
END $$;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "visibility_scope" "ClientVisibilityScope" NOT NULL DEFAULT 'COMPANY';
