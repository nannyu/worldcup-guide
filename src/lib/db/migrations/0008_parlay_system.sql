-- Parlay (accumulator) betting support
-- New parlays table
CREATE TABLE "parlays" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"leg_count" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"combined_odds" numeric(16, 6) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"payout" numeric(14, 4) DEFAULT '0' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlays_user_idx" ON "parlays" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parlays_user_status_idx" ON "parlays" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "parlays_status_settled_idx" ON "parlays" USING btree ("status","settled_at");--> statement-breakpoint
-- Add parlay_id FK to existing bets table
ALTER TABLE "bets" ADD COLUMN "parlay_id" varchar(128);--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_parlay_id_parlays_id_fk" FOREIGN KEY ("parlay_id") REFERENCES "public"."parlays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_parlay_idx" ON "bets" USING btree ("parlay_id");
