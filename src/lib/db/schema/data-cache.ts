import type { InferSelectModel } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const dataSourceFetches = pgTable(
  "data_source_fetches",
  {
    cacheKey: varchar("cache_key", { length: 512 }).primaryKey(),
    sourceId: varchar("source_id", { length: 128 }).notNull(),
    sourceType: varchar("source_type", { length: 64 }).notNull(),
    adapter: varchar("adapter", { length: 128 }).notNull(),
    requestUrl: text("request_url").notNull(),
    requestParams: jsonb("request_params").$type<Record<string, string | number | undefined>>().notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    statusCode: integer("status_code"),
    fetchedAt: timestamp("fetched_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index("data_source_fetches_source_idx").on(table.sourceId, table.sourceType),
    expiresAtIdx: index("data_source_fetches_expires_at_idx").on(table.expiresAt),
  }),
);

export const dataSnapshots = pgTable(
  "data_snapshots",
  {
    snapshotKey: varchar("snapshot_key", { length: 256 }).primaryKey(),
    feature: varchar("feature", { length: 64 }).notNull(),
    sourceMode: varchar("source_mode", { length: 32 }).notNull(),
    sourceId: varchar("source_id", { length: 128 }),
    payload: jsonb("payload").$type<unknown>().notNull(),
    diagnostics: jsonb("diagnostics").$type<unknown>().notNull(),
    computedAt: timestamp("computed_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    featureIdx: index("data_snapshots_feature_idx").on(table.feature),
    expiresAtIdx: index("data_snapshots_expires_at_idx").on(table.expiresAt),
    featureComputedIdx: index("data_snapshots_feature_computed_idx").on(table.feature, table.computedAt),
  }),
);

export const dataSourceUsageEvents = pgTable(
  "data_source_usage_events",
  {
    eventId: varchar("event_id", { length: 512 }).primaryKey(),
    sourceId: varchar("source_id", { length: 128 }).notNull(),
    sourceType: varchar("source_type", { length: 64 }).notNull(),
    adapter: varchar("adapter", { length: 128 }).notNull(),
    quotaCost: integer("quota_cost").notNull().default(1),
    statusCode: integer("status_code"),
    fetchedAt: timestamp("fetched_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sourceFetchedIdx: index("data_source_usage_events_source_fetched_idx").on(
      table.sourceId,
      table.fetchedAt,
    ),
  }),
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: varchar("id", { length: 256 }).primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    priority: integer("priority").notNull().default(100),
    runAfter: timestamp("run_after").notNull().defaultNow(),
    lockedAt: timestamp("locked_at"),
    lockedBy: varchar("locked_by", { length: 128 }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    statusRunAfterIdx: index("background_jobs_status_run_after_idx").on(table.status, table.runAfter),
    typeStatusIdx: index("background_jobs_type_status_idx").on(table.type, table.status),
    lockedAtIdx: index("background_jobs_locked_at_idx").on(table.lockedAt),
  }),
);

export type DataSourceFetch = InferSelectModel<typeof dataSourceFetches>;
export type DataSnapshot = InferSelectModel<typeof dataSnapshots>;
export type DataSourceUsageEvent = InferSelectModel<typeof dataSourceUsageEvents>;
export type BackgroundJob = InferSelectModel<typeof backgroundJobs>;
