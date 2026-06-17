import type { InferSelectModel } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    feature: varchar("feature", { length: 128 }).notNull(),
    path: varchar("path", { length: 512 }).notNull(),
    title: text("title"),
    visitorId: varchar("visitor_id", { length: 128 }).notNull(),
    sessionId: varchar("session_id", { length: 128 }).notNull(),
    visitorKey: varchar("visitor_key", { length: 128 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    targetType: varchar("target_type", { length: 64 }),
    targetLabel: text("target_label"),
    targetHref: text("target_href"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    occurredAtIdx: index("analytics_events_occurred_at_idx").on(table.occurredAt),
    typeOccurredAtIdx: index("analytics_events_type_occurred_at_idx").on(
      table.eventType,
      table.occurredAt,
    ),
    featureOccurredAtIdx: index("analytics_events_feature_occurred_at_idx").on(
      table.feature,
      table.occurredAt,
    ),
    pathOccurredAtIdx: index("analytics_events_path_occurred_at_idx").on(
      table.path,
      table.occurredAt,
    ),
    visitorOccurredAtIdx: index("analytics_events_visitor_occurred_at_idx").on(
      table.visitorKey,
      table.occurredAt,
    ),
    sessionOccurredAtIdx: index("analytics_events_session_occurred_at_idx").on(
      table.sessionId,
      table.occurredAt,
    ),
  }),
);

export type AnalyticsEventRecord = InferSelectModel<typeof analyticsEvents>;
