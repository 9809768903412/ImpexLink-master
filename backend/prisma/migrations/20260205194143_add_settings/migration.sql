-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notification_prefs" JSONB,
ADD COLUMN     "phone" VARCHAR(30);

-- CreateTable
CREATE TABLE "company_settings" (
    "company_id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "address" TEXT NOT NULL,
    "tin" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "website" VARCHAR(150) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("company_id")
);
