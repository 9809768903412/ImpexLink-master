ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;

CREATE INDEX IF NOT EXISTS "chat_threads_project_id_idx" ON "chat_threads"("project_id");

DO $$ BEGIN
  ALTER TABLE "chat_threads"
    ADD CONSTRAINT "chat_threads_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
