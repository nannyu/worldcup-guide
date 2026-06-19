ALTER TABLE "comments" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "author_type" varchar(16) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "ai_provider" varchar(128);--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id","created_at");
