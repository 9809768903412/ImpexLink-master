CREATE TABLE IF NOT EXISTS "uploaded_files" (
  "file_id" SERIAL PRIMARY KEY,
  "storage_key" VARCHAR(255) NOT NULL UNIQUE,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
