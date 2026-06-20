CREATE INDEX IF NOT EXISTS "market_snapshots_radar_latest_idx"
ON "market_snapshots" USING btree ("external_market_id", "captured_at" DESC, "id" DESC)
WHERE ("raw"->>'kind') = 'radar';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_snapshots_odds_latest_idx"
ON "market_snapshots" USING btree ("external_market_id", "captured_at" DESC, "id" DESC)
WHERE ("raw"->>'kind') = 'odds';
