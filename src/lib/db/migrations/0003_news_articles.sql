CREATE TABLE "news_articles" (
  "article_id" varchar(256) PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "source" varchar(128) NOT NULL,
  "published_at" timestamp with time zone NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "domain" varchar(256),
  "language" varchar(32),
  "country" varchar(32),
  "image_url" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "news_articles_published_at_idx" ON "news_articles" USING btree ("published_at");
--> statement-breakpoint
CREATE INDEX "news_articles_source_published_at_idx" ON "news_articles" USING btree ("source","published_at");
