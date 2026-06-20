import type { InferSelectModel } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
  numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const parlays = pgTable(
  "parlays",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: varchar("user_id", { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    legCount: integer("leg_count").notNull(),
    totalAmount: integer("total_amount").notNull(),
    combinedOdds: numeric("combined_odds", { precision: 16, scale: 6 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    payout: numeric("payout", { precision: 14, scale: 4 }).notNull().default("0"),
    settledAt: timestamp("settled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("parlays_user_idx").on(table.userId),
    userIdStatusIdx: index("parlays_user_status_idx").on(table.userId, table.status),
    statusSettledIdx: index("parlays_status_settled_idx").on(table.status, table.settledAt),
  }),
);

export type Parlay = InferSelectModel<typeof parlays>;
