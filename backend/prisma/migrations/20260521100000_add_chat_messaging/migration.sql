CREATE TABLE IF NOT EXISTS "chat_threads" (
  "thread_id" SERIAL PRIMARY KEY,
  "title" VARCHAR(150),
  "thread_type" VARCHAR(30) NOT NULL DEFAULT 'DIRECT',
  "created_by_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  CONSTRAINT "chat_threads_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "chat_threads_created_by_id_idx" ON "chat_threads"("created_by_id");
CREATE INDEX IF NOT EXISTS "chat_threads_updated_at_idx" ON "chat_threads"("updated_at");

CREATE TABLE IF NOT EXISTS "chat_participants" (
  "participant_id" SERIAL PRIMARY KEY,
  "thread_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "last_read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_participants_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("thread_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_participants_thread_id_user_id_key"
  ON "chat_participants"("thread_id", "user_id");
CREATE INDEX IF NOT EXISTS "chat_participants_user_id_idx" ON "chat_participants"("user_id");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "message_id" SERIAL PRIMARY KEY,
  "thread_id" INTEGER NOT NULL,
  "sender_id" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "chat_messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("thread_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "chat_messages_thread_id_created_at_idx" ON "chat_messages"("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_sender_id_idx" ON "chat_messages"("sender_id");
