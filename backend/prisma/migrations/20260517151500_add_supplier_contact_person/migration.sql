ALTER TABLE "suppliers" ADD COLUMN "contact_person" VARCHAR(150);

UPDATE "suppliers"
SET "contact_person" = "country"
WHERE "contact_person" IS NULL
  AND "country" IS NOT NULL
  AND "country" NOT IN ('Philippines', 'Singapore', 'Malaysia', 'Thailand', 'Vietnam', 'Indonesia', 'China', 'Japan', 'South Korea');

UPDATE "suppliers"
SET "country" = 'Philippines'
WHERE "country" IS NULL
   OR "country" NOT IN ('Philippines', 'Singapore', 'Malaysia', 'Thailand', 'Vietnam', 'Indonesia', 'China', 'Japan', 'South Korea');
