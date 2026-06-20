CREATE TABLE IF NOT EXISTS "bets" (
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chip_mints" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"date_key" varchar(10) NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chip_mints_user_date_key" UNIQUE("user_id","date_key"),
	CONSTRAINT "chip_mints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_balances" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"total_minted" integer DEFAULT 0 NOT NULL,
	"total_wagered" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"bet_count" integer DEFAULT 0 NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "canonical_payload" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bets_user_idx" ON "bets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bets_user_status_idx" ON "bets" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bets_match_status_idx" ON "bets" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bets_market_idx" ON "bets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bets_created_idx" ON "bets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chip_mints_user_idx" ON "chip_mints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chip_mints_date_key_idx" ON "chip_mints" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_snapshots_feature_computed_idx" ON "data_snapshots" USING btree ("feature","computed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_home_team_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_away_team_idx" ON "matches" USING btree ("away_team_id");
