import type { InferSelectModel } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const competitions = pgTable("competitions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: text("name").notNull(),
  season: integer("season").notNull(),
  sourceId: varchar("source_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teams = pgTable(
  "teams",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    fifaCode: varchar("fifa_code", { length: 8 }).unique(),
    name: text("name").notNull(),
    nameZh: text("name_zh"),
    flag: varchar("flag", { length: 16 }),
    raw: jsonb("raw").$type<unknown>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    fifaCodeIdx: index("teams_fifa_code_idx").on(table.fifaCode),
  }),
);

export const venues = pgTable(
  "venues",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    countryCode: varchar("country_code", { length: 8 }),
    utcOffset: varchar("utc_offset", { length: 16 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    cityIdx: index("venues_city_idx").on(table.city),
  }),
);

export const matches = pgTable(
  "matches",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    competitionId: varchar("competition_id", { length: 128 })
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    matchNo: integer("match_no").notNull(),
    stage: varchar("stage", { length: 64 }).notNull(),
    groupName: varchar("group_name", { length: 16 }),
    easternDate: date("eastern_date").notNull(),
    easternTime: time("eastern_time").notNull(),
    localDate: date("local_date").notNull(),
    localTime: time("local_time").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    venueId: varchar("venue_id", { length: 128 }).references(() => venues.id),
    homeTeamId: varchar("home_team_id", { length: 128 }).references(() => teams.id),
    awayTeamId: varchar("away_team_id", { length: 128 }).references(() => teams.id),
    homePlaceholder: text("home_placeholder"),
    awayPlaceholder: text("away_placeholder"),
    status: varchar("status", { length: 32 }).notNull().default("scheduled"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    sourceId: varchar("source_id", { length: 128 }).notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    raw: jsonb("raw").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    competitionMatchIdx: uniqueIndex("matches_competition_match_idx").on(
      table.competitionId,
      table.matchNo,
    ),
    kickoffIdx: index("matches_kickoff_idx").on(table.kickoffAt),
    easternDateIdx: index("matches_eastern_date_idx").on(table.easternDate),
    statusIdx: index("matches_status_idx").on(table.status),
  }),
);

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: serial("id").primaryKey(),
    matchId: varchar("match_id", { length: 128 }).references(() => matches.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 64 }).notNull(),
    externalMarketId: varchar("external_market_id", { length: 256 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    homeProbability: numeric("home_probability", { precision: 7, scale: 4 }),
    drawProbability: numeric("draw_probability", { precision: 7, scale: 4 }),
    awayProbability: numeric("away_probability", { precision: 7, scale: 4 }),
    volume: numeric("volume", { precision: 20, scale: 4 }),
    raw: jsonb("raw").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    marketCaptureIdx: index("market_snapshots_capture_idx").on(
      table.provider,
      table.externalMarketId,
      table.capturedAt,
    ),
    matchCapturedAtIdx: index("market_snapshots_match_captured_idx").on(
      table.matchId,
      table.capturedAt,
    ),
  }),
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: varchar("source_id", { length: 128 }).notNull(),
    feature: varchar("feature", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    recordsRead: integer("records_read").notNull().default(0),
    recordsWritten: integer("records_written").notNull().default(0),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<unknown>(),
  },
  (table) => ({
    sourceStartedIdx: index("ingestion_runs_source_started_idx").on(
      table.sourceId,
      table.startedAt,
    ),
  }),
);

export type Competition = InferSelectModel<typeof competitions>;
export type TeamRecord = InferSelectModel<typeof teams>;
export type Venue = InferSelectModel<typeof venues>;
export type MatchRecord = InferSelectModel<typeof matches>;
export type MarketSnapshot = InferSelectModel<typeof marketSnapshots>;
export type IngestionRun = InferSelectModel<typeof ingestionRuns>;
