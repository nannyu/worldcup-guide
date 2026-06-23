import type { InferSelectModel } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const comments = pgTable(
  "comments",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    articleId: varchar("article_id", { length: 256 }).notNull(),
    userId: varchar("user_id", { length: 128 }),
    parentId: varchar("parent_id", { length: 128 }),
    content: text("content").notNull(),
    authorName: varchar("author_name", { length: 64 }).default(""),
    authorAvatar: varchar("author_avatar", { length: 256 }).default(""),
    aiReply: text("ai_reply"),
    aiReplyStatus: varchar("ai_reply_status", { length: 16 }).default("pending"),
    status: varchar("status", { length: 16 }).default("active"),
    likeCount: integer("like_count").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    articleIdx: index("comments_article_idx").on(table.articleId, table.createdAt),
    parentIdx: index("comments_parent_idx").on(table.parentId),
    statusIdx: index("comments_status_idx").on(table.status),
  }),
);

export type Comment = InferSelectModel<typeof comments>;
