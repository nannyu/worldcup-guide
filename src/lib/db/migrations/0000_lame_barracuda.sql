CREATE TABLE "data_snapshots" (
	"snapshot_key" varchar(256) PRIMARY KEY NOT NULL,
	"feature" varchar(64) NOT NULL,
	"source_mode" varchar(32) NOT NULL,
	"source_id" varchar(128),
	"payload" jsonb NOT NULL,
	"diagnostics" jsonb NOT NULL,
	"computed_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_source_fetches" (
	"cache_key" varchar(512) PRIMARY KEY NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"source_type" varchar(64) NOT NULL,
	"adapter" varchar(128) NOT NULL,
	"request_url" text NOT NULL,
	"request_params" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"fetched_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(256),
	"name" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season" integer NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"feature" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" varchar(128),
	"provider" varchar(64) NOT NULL,
	"external_market_id" varchar(256) NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"home_probability" numeric(7, 4),
	"draw_probability" numeric(7, 4),
	"away_probability" numeric(7, 4),
	"volume" numeric(20, 4),
	"raw" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"competition_id" varchar(128) NOT NULL,
	"match_no" integer NOT NULL,
	"stage" varchar(64) NOT NULL,
	"group_name" varchar(16),
	"eastern_date" date NOT NULL,
	"eastern_time" time NOT NULL,
	"local_date" date NOT NULL,
	"local_time" time NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"venue_id" varchar(128),
	"home_team_id" varchar(128),
	"away_team_id" varchar(128),
	"home_placeholder" text,
	"away_placeholder" text,
	"status" varchar(32) DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"source_id" varchar(128) NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"fifa_code" varchar(8),
	"name" text NOT NULL,
	"name_zh" text,
	"flag" varchar(16),
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_fifa_code_unique" UNIQUE("fifa_code")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"country_code" varchar(8),
	"utc_offset" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_snapshots_feature_idx" ON "data_snapshots" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "data_snapshots_expires_at_idx" ON "data_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "data_source_fetches_source_idx" ON "data_source_fetches" USING btree ("source_id","source_type");--> statement-breakpoint
CREATE INDEX "data_source_fetches_expires_at_idx" ON "data_source_fetches" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_started_idx" ON "ingestion_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "market_snapshots_capture_idx" ON "market_snapshots" USING btree ("provider","external_market_id","captured_at");--> statement-breakpoint
CREATE INDEX "market_snapshots_match_captured_idx" ON "market_snapshots" USING btree ("match_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_competition_match_idx" ON "matches" USING btree ("competition_id","match_no");--> statement-breakpoint
CREATE INDEX "matches_kickoff_idx" ON "matches" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "matches_eastern_date_idx" ON "matches" USING btree ("eastern_date");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "teams_fifa_code_idx" ON "teams" USING btree ("fifa_code");--> statement-breakpoint
CREATE INDEX "venues_city_idx" ON "venues" USING btree ("city");