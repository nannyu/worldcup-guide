import type { InferSelectModel } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
  numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { parlays } from "./parlay";

export const chipMints = pgTable(
  "chip_mints",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dateKey: varchar("date_key", { length: 10 }).notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userDateUnique: unique("chip_mints_user_date_key").on(table.userId, table.dateKey),
    userIdx: index("chip_mints_user_idx").on(table.userId),
    dateKeyIdx: index("chip_mints_date_key_idx").on(table.dateKey),
  }),
);

export const bets = pgTable(
  "bets",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: varchar("user_id", { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketId: varchar("market_id", { length: 256 }).notNull(),
    matchId: varchar("match_id", { length: 128 }).notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    outcomeIndex: integer("outcome_index").notNull(),
    outcomeLabel: text("outcome_label").notNull(),
    amount: integer("amount").notNull(),
    probabilityAtBet: numeric("probability_at_bet", { precision: 7, scale: 4 }).notNull(),
    oddsAtBet: numeric("odds_at_bet", { precision: 10, scale: 4 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    payout: numeric("payout", { precision: 12, scale: 4 }).notNull().default("0"),
    settledAt: timestamp("settled_at"),
    parlayId: varchar("parlay_id", { length: 128 }).references(() => parlays.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("bets_user_idx").on(table.userId),
    userIdStatusIdx: index("bets_user_status_idx").on(table.userId, table.status),
    matchIdStatusIdx: index("bets_match_status_idx").on(table.matchId, table.status),
    marketIdx: index("bets_market_idx").on(table.marketId),
    createdIdx: index("bets_created_idx").on(table.createdAt),
    parlayIdx: index("bets_parlay_idx").on(table.parlayId),
  }),
);

export const userBalances = pgTable(
  "user_balances",
  {
    userId: varchar("user_id", { length: 128 })
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    totalMinted: integer("total_minted").notNull().default(0),
    totalWagered: integer("total_wagered").notNull().default(0),
    totalWon: integer("total_won").notNull().default(0),
    betCount: integer("bet_count").notNull().default(0),
    winCount: integer("win_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export type ChipMint = InferSelectModel<typeof chipMints>;
export type Bet = InferSelectModel<typeof bets>;
export type UserBalance = InferSelectModel<typeof userBalances>;
