CREATE TABLE IF NOT EXISTS "comments" (
  "id" varchar(128) PRIMARY KEY,
  "article_id" varchar(256) NOT NULL,
  "user_id" varchar(128),
  "parent_id" varchar(128),
  "content" text NOT NULL,
  "author_name" varchar(64) DEFAULT '',
  "author_avatar" varchar(256) DEFAULT '',
  "ai_reply" text,
  "ai_reply_status" varchar(16) DEFAULT 'pending',
  "status" varchar(16) DEFAULT 'active',
  "like_count" integer DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "comments_article_idx" ON "comments" ("article_id", "created_at");
CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" ("parent_id");
CREATE INDEX IF NOT EXISTS "comments_status_idx" ON "comments" ("status");
