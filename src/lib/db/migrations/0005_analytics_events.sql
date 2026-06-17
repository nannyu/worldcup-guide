CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "feature" varchar(128) NOT NULL,
  "path" varchar(512) NOT NULL,
  "title" text,
  "visitor_id" varchar(128) NOT NULL,
  "session_id" varchar(128) NOT NULL,
  "visitor_key" varchar(128) NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "referrer" text,
  "target_type" varchar(64),
  "target_label" text,
  "target_href" text,
  "duration_ms" integer,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "analytics_events_occurred_at_idx" ON "analytics_events" ("occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_type_occurred_at_idx" ON "analytics_events" ("event_type","occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_feature_occurred_at_idx" ON "analytics_events" ("feature","occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_path_occurred_at_idx" ON "analytics_events" ("path","occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_visitor_occurred_at_idx" ON "analytics_events" ("visitor_key","occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_session_occurred_at_idx" ON "analytics_events" ("session_id","occurred_at");
