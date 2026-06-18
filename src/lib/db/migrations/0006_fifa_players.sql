CREATE TABLE IF NOT EXISTS "players" (
  "id" varchar(160) PRIMARY KEY NOT NULL,
  "team_id" varchar(128),
  "team_code" varchar(8) NOT NULL,
  "team_name" text NOT NULL,
  "team_name_zh" text,
  "group_name" varchar(16),
  "shirt_number" integer NOT NULL,
  "position_code" varchar(8) NOT NULL,
  "position" text NOT NULL,
  "position_zh" text NOT NULL,
  "player_name" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "shirt_name" text,
  "name_zh" text,
  "date_of_birth" date,
  "club" text,
  "club_zh" text,
  "height_cm" integer,
  "caps" integer,
  "goals" integer,
  "source_id" varchar(128) NOT NULL,
  "source_page" integer,
  "match_status" varchar(32) DEFAULT 'unmatched' NOT NULL,
  "match_score" numeric(6, 2),
  "raw" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "players_team_code_idx" ON "players" USING btree ("team_code");
CREATE INDEX IF NOT EXISTS "players_team_position_idx" ON "players" USING btree ("team_code","position_code");
CREATE UNIQUE INDEX IF NOT EXISTS "players_team_shirt_unique" ON "players" USING btree ("team_code","shirt_number");
