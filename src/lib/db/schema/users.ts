import type { InferSelectModel } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    email: varchar("email", { length: 256 }).unique(),
    passwordHash: text("password_hash"),
    name: text("name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    favoriteTeams: jsonb("favorite_teams").$type<string[]>().notNull().default([]),
    favoritePlayers: jsonb("favorite_players").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    createdAtIdx: index("users_created_at_idx").on(table.createdAt),
  })
);

export type User = InferSelectModel<typeof users>;

export const userSessions = pgTable(
  "user_sessions",
  {
    tokenHash: varchar("token_hash", { length: 128 }).primaryKey(),
    userId: varchar("user_id", { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
  })
);

export type UserSession = InferSelectModel<typeof userSessions>;
