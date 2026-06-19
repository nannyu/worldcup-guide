import type { InferSelectModel } from "drizzle-orm";
import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id"),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetId: varchar("target_id", { length: 256 }).notNull(),
    userId: varchar("user_id", { length: 128 })
      .references(() => users.id, { onDelete: "cascade" }),
    authorType: varchar("author_type", { length: 16 }).notNull().default("user"),
    aiProvider: varchar("ai_provider", { length: 128 }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: index("comments_target_idx").on(table.targetType, table.targetId, table.createdAt),
    parentIdx: index("comments_parent_idx").on(table.parentId, table.createdAt),
    userIdx: index("comments_user_idx").on(table.userId, table.createdAt),
  })
);

export type Comment = InferSelectModel<typeof comments>;
