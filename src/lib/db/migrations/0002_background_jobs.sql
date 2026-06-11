CREATE TABLE "background_jobs" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"locked_by" varchar(128),
	"started_at" timestamp,
	"finished_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "background_jobs_status_run_after_idx" ON "background_jobs" USING btree ("status","run_after");
--> statement-breakpoint
CREATE INDEX "background_jobs_type_status_idx" ON "background_jobs" USING btree ("type","status");
--> statement-breakpoint
CREATE INDEX "background_jobs_locked_at_idx" ON "background_jobs" USING btree ("locked_at");
