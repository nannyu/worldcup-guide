CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" varchar(256) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_target_idx" ON "comments" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id","created_at");
