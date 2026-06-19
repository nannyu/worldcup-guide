import { type NextRequest, NextResponse } from "next/server";
import { generateAiCommentReply } from "@/lib/ai/comment-replies";
import { getCurrentLocalUser } from "@/lib/auth/local";
import { createComment, getCommentById, isCommentTargetType, listComments } from "@/lib/db/queries";

const maxCommentLength = 500;

function cleanTargetId(input: string | null): string {
  return String(input || "").trim().slice(0, 256);
}

function cleanBody(input: unknown): string {
  return String(input || "").replace(/\s+/g, " ").trim().slice(0, maxCommentLength);
}

function cleanParentId(input: unknown): number | null {
  if (input === undefined || input === null || input === "") return null;
  const id = Number(input);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetType = searchParams.get("targetType") || "";
  const targetId = cleanTargetId(searchParams.get("targetId"));

  if (!isCommentTargetType(targetType) || !targetId) {
    return NextResponse.json({ ok: false, error: "评论对象不正确" }, { status: 400 });
  }

  const comments = await listComments({ targetType, targetId });
  return NextResponse.json({ ok: true, comments });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentLocalUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "请先登录后评论" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const targetType = String(body?.targetType || "");
  const targetId = cleanTargetId(body?.targetId);
  const commentBody = cleanBody(body?.body);
  const parentId = cleanParentId(body?.parentId);

  if (!isCommentTargetType(targetType) || !targetId) {
    return NextResponse.json({ ok: false, error: "评论对象不正确" }, { status: 400 });
  }
  if (!commentBody) {
    return NextResponse.json({ ok: false, error: "评论内容不能为空" }, { status: 400 });
  }

  const parent = parentId ? await getCommentById(parentId) : undefined;
  if (parentId && (!parent || parent.targetType !== targetType || parent.targetId !== targetId)) {
    return NextResponse.json({ ok: false, error: "被回复的评论不存在" }, { status: 400 });
  }

  const comment = await createComment({
    targetType,
    targetId,
    userId: user.id,
    parentId,
    body: commentBody,
  });

  let aiReply;
  if (comment) {
    try {
      const generated = await generateAiCommentReply({
        targetType,
        targetId,
        commentBody,
        parentBody: parent?.body,
      });
      aiReply = await createComment({
        targetType,
        targetId,
        parentId: comment.id,
        authorType: "ai",
        aiProvider: generated.providerName,
        body: generated.body,
      });
    } catch (error) {
      console.error("[comments] create AI reply failed", error);
    }
  }

  return NextResponse.json({ ok: true, comment, aiReply });
}
