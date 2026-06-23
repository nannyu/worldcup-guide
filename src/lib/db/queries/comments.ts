import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { comments, type Comment } from "../schema/comments";

export async function createComment(input: {
  articleId: string;
  userId?: string;
  parentId?: string;
  content: string;
  authorName?: string;
  authorAvatar?: string;
}): Promise<Comment | undefined> {
  if (!isDatabaseConfigured) return undefined;
  const id = `cmt:${randomUUID()}`;
  const now = new Date();
  try {
    const rows = await getDb()
      .insert(comments)
      .values({
        id,
        articleId: input.articleId.slice(0, 256),
        userId: input.userId || null,
        parentId: input.parentId || null,
        content: input.content.slice(0, 2000),
        authorName: (input.authorName || "").slice(0, 64),
        authorAvatar: (input.authorAvatar || "").slice(0, 256),
        aiReply: null,
        aiReplyStatus: "pending",
        status: "active",
        likeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("createComment failed:", error);
    return undefined;
  }
}

export async function activeCommentExistsForArticle(commentId: string, articleId: string): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  try {
    const rows = await getDb()
      .select({ id: comments.id })
      .from(comments)
      .where(and(
        eq(comments.id, commentId),
        eq(comments.articleId, articleId),
        eq(comments.status, "active"),
      ))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getCommentsForArticle(articleId: string, limit = 50): Promise<Comment[]> {
  if (!isDatabaseConfigured) return [];
  try {
    return getDb()
      .select()
      .from(comments)
      .where(and(eq(comments.articleId, articleId), eq(comments.status, "active")))
      .orderBy(desc(comments.createdAt))
      .limit(limit);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("getCommentsForArticle failed:", error);
    return [];
  }
}

export async function getCommentCountForArticle(articleId: string): Promise<number> {
  if (!isDatabaseConfigured) return 0;
  try {
    const rows = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.articleId, articleId), eq(comments.status, "active")));
    return rows[0]?.count || 0;
  } catch {
    return 0;
  }
}

export async function deleteComment(commentId: string, userId: string): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  try {
    const rows = await getDb()
      .update(comments)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
      .returning();
    return rows.length > 0;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("deleteComment failed:", error);
    return false;
  }
}

export async function likeComment(commentId: string): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  try {
    const rows = await getDb()
      .update(comments)
      .set({
        likeCount: sql`coalesce(${comments.likeCount}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(comments.id, commentId), eq(comments.status, "active")))
      .returning();
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function updateCommentAiReply(
  commentId: string,
  reply: string,
  status: "replied" | "failed",
): Promise<void> {
  if (!isDatabaseConfigured) return;
  try {
    await getDb()
      .update(comments)
      .set({
        aiReply: reply,
        aiReplyStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.warn("updateCommentAiReply failed:", error);
  }
}
