CREATE TABLE "bets" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"market_id" varchar(256) NOT NULL,
	"match_id" varchar(128) NOT NULL,
	"category" varchar(32) NOT NULL,
	"outcome_index" integer NOT NULL,
	"outcome_label" text NOT NULL,
	"amount" integer NOT NULL,
	"probability_at_bet" numeric(7, 4) NOT NULL,
	"odds_at_bet" numeric(10, 4) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"payout" numeric(12, 4) DEFAULT '0' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chip_mints" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"date_key" varchar(10) NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chip_mints_user_date_key" UNIQUE("user_id","date_key")
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"total_minted" integer DEFAULT 0 NOT NULL,
	"total_wagered" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"bet_count" integer DEFAULT 0 NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "matches" ADD COLUMN "canonical_payload" jsonb;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_mints" ADD CONSTRAINT "chip_mints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_user_idx" ON "bets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bets_user_status_idx" ON "bets" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bets_match_status_idx" ON "bets" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX "bets_market_idx" ON "bets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "bets_created_idx" ON "bets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chip_mints_user_idx" ON "chip_mints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chip_mints_date_key_idx" ON "chip_mints" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "background_jobs_status_run_after_idx" ON "background_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "background_jobs_type_status_idx" ON "background_jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "background_jobs_locked_at_idx" ON "background_jobs" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "data_source_usage_events_source_fetched_idx" ON "data_source_usage_events" USING btree ("source_id","fetched_at");--> statement-breakpoint
CREATE INDEX "news_articles_published_at_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "news_articles_source_published_at_idx" ON "news_articles" USING btree ("source","published_at");--> statement-breakpoint
CREATE INDEX "data_snapshots_feature_computed_idx" ON "data_snapshots" USING btree ("feature","computed_at");--> statement-breakpoint
CREATE INDEX "matches_home_team_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "matches_away_team_idx" ON "matches" USING btree ("away_team_id");