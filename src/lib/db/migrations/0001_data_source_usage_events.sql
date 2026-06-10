CREATE TABLE "data_source_usage_events" (
	"event_id" varchar(512) PRIMARY KEY NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"source_type" varchar(64) NOT NULL,
	"adapter" varchar(128) NOT NULL,
	"quota_cost" integer DEFAULT 1 NOT NULL,
	"status_code" integer,
	"fetched_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "data_source_usage_events_source_fetched_idx" ON "data_source_usage_events" USING btree ("source_id","fetched_at");
