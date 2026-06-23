import { after, type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/api/rate-limit";
import {
  activeCommentExistsForArticle,
  createComment,
  getCommentsForArticle,
  getCommentCountForArticle,
  updateCommentAiReply,
} from "@/lib/db/queries/comments";
import { generateCommentReply } from "@/lib/ai/comment-reply";
import { readAdminConfig } from "@/lib/admin/config";
import { orderAiProviders } from "@/lib/data-sources/transforms/news";
import { newsArticles } from "@/lib/db/schema/world-cup";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import type { NewsArticle } from "@/lib/wc-data";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;

  const articleId = request.nextUrl.searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json({ ok: false, error: "articleId is required" }, { status: 400 });
  }

  const [comments, count] = await Promise.all([
    getCommentsForArticle(articleId),
    getCommentCountForArticle(articleId),
  ]);

  return NextResponse.json({ ok: true, comments, count }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;

  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { articleId, content, parentId } = body as {
    articleId?: string;
    content?: string;
    parentId?: string;
  };
  const normalizedArticleId = typeof articleId === "string" ? articleId.trim() : "";
  const normalizedContent = typeof content === "string" ? content.trim() : "";
  const normalizedParentId = typeof parentId === "string" && parentId.trim().length > 0
    ? parentId.trim()
    : undefined;

  if (!normalizedArticleId || !normalizedContent) {
    return NextResponse.json({ ok: false, error: "articleId and content are required" }, { status: 400 });
  }
  if (normalizedArticleId.length > 256) {
    return NextResponse.json({ ok: false, error: "articleId is too long" }, { status: 400 });
  }
  if (normalizedContent.length > 2000) {
    return NextResponse.json({ ok: false, error: "Content too long (max 2000 characters)" }, { status: 400 });
  }
  if (normalizedParentId && normalizedParentId.length > 128) {
    return NextResponse.json({ ok: false, error: "parentId is too long" }, { status: 400 });
  }

  const article = await readArticleForComment(normalizedArticleId);
  if (!article) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  if (normalizedParentId) {
    const parentExists = await activeCommentExistsForArticle(normalizedParentId, normalizedArticleId);
    if (!parentExists) {
      return NextResponse.json({ ok: false, error: "Parent comment not found" }, { status: 400 });
    }
  }

  const comment = await createComment({
    articleId: normalizedArticleId,
    userId: auth.user.id,
    parentId: normalizedParentId,
    content: normalizedContent,
    authorName: auth.user.name || "",
    authorAvatar: auth.user.avatarUrl || "",
  });

  if (!comment) {
    return NextResponse.json({ ok: false, error: "Failed to create comment" }, { status: 500 });
  }

  after(() => generateAiReplyAsync(article, comment.id, normalizedContent));

  return NextResponse.json({ ok: true, comment });
}

async function readArticleForComment(articleId: string): Promise<NewsArticle | null> {
  if (!isDatabaseConfigured) return null;
  const rows = await getDb()
    .select({ payload: newsArticles.payload })
    .from(newsArticles)
    .where(eq(newsArticles.articleId, articleId))
    .limit(1);
  return (rows[0]?.payload as unknown as NewsArticle) || null;
}

async function generateAiReplyAsync(article: NewsArticle, commentId: string, content: string) {
  if (!isDatabaseConfigured) return;
  try {
    const config = await readAdminConfig();
    const providers = orderAiProviders(config.aiProviders, config.primaryAiProviderId);

    const { reply, message } = await generateCommentReply(article, content, providers);
    if (reply) {
      await updateCommentAiReply(commentId, reply, "replied");
    } else {
      await updateCommentAiReply(commentId, message, "failed");
    }
  } catch {
    await updateCommentAiReply(commentId, "AI 回复生成失败", "failed");
  }
}
