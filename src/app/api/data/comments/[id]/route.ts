import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/api/rate-limit";
import { deleteComment } from "@/lib/db/queries/comments";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;

  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Comment ID is required" }, { status: 400 });
  }

  const deleted = await deleteComment(id, auth.user.id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Comment not found or not authorized" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
