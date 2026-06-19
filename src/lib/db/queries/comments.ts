import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { comments } from "../schema/comments";
import { users } from "../schema/users";

export type CommentTargetType = "news" | "match" | "team";

export interface PublicComment {
  id: number;
  parentId: number | null;
  targetType: CommentTargetType;
  targetId: string;
  authorType: "user" | "ai";
  aiProvider: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

export function isCommentTargetType(input: string): input is CommentTargetType {
  return input === "news" || input === "match" || input === "team";
}

export async function listComments(data: {
  targetType: CommentTargetType;
  targetId: string;
  limit?: number;
}): Promise<PublicComment[]> {
  const rows = await getDb()
    .select({
      comment: comments,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.targetType, data.targetType), eq(comments.targetId, data.targetId)))
    .orderBy(desc(comments.createdAt))
    .limit(Math.min(Math.max(data.limit ?? 30, 1), 100));

  return rows.reverse().map((row) => ({
    id: row.comment.id,
    parentId: row.comment.parentId,
    targetType: row.comment.targetType as CommentTargetType,
    targetId: row.comment.targetId,
    authorType: row.comment.authorType as "user" | "ai",
    aiProvider: row.comment.aiProvider,
    body: row.comment.body,
    createdAt: row.comment.createdAt,
    updatedAt: row.comment.updatedAt,
    author: row.author ?? { id: "ai", name: "AI 装杯评论员", email: null },
  }));
}

export async function createComment(data: {
  targetType: CommentTargetType;
  targetId: string;
  userId?: string | null;
  parentId?: number | null;
  authorType?: "user" | "ai";
  aiProvider?: string | null;
  body: string;
}): Promise<PublicComment | undefined> {
  const inserted = await getDb()
    .insert(comments)
    .values({
      targetType: data.targetType,
      targetId: data.targetId,
      userId: data.userId ?? null,
      parentId: data.parentId ?? null,
      authorType: data.authorType ?? "user",
      aiProvider: data.aiProvider ?? null,
      body: data.body,
    })
    .returning();

  const comment = inserted[0];
  if (!comment) return undefined;

  const rows = await getDb()
    .select({
      comment: comments,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, comment.id))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.comment.id,
    parentId: row.comment.parentId,
    targetType: row.comment.targetType as CommentTargetType,
    targetId: row.comment.targetId,
    authorType: row.comment.authorType as "user" | "ai",
    aiProvider: row.comment.aiProvider,
    body: row.comment.body,
    createdAt: row.comment.createdAt,
    updatedAt: row.comment.updatedAt,
    author: row.author ?? { id: "ai", name: "AI 装杯评论员", email: null },
  };
}

export async function getCommentById(id: number): Promise<PublicComment | undefined> {
  const rows = await getDb()
    .select({
      comment: comments,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.comment.id,
    parentId: row.comment.parentId,
    targetType: row.comment.targetType as CommentTargetType,
    targetId: row.comment.targetId,
    authorType: row.comment.authorType as "user" | "ai",
    aiProvider: row.comment.aiProvider,
    body: row.comment.body,
    createdAt: row.comment.createdAt,
    updatedAt: row.comment.updatedAt,
    author: row.author ?? { id: "ai", name: "AI 装杯评论员", email: null },
  };
}
