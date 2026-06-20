import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { upsertUser, updateUser } from "@/lib/db/queries";

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

/**
 * GET /api/user/profile
 * Decrypts the x-eazo-session header and returns the authenticated user's profile.
 * Works for both Eazo Mobile and Web — both send the same encrypted session shape.
 * Also upserts the user into the local DB so user info is always up to date.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const { user } = auth;

  // Upsert in the background — don't block the response on DB latency.
  upsertUser({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  }).catch((err) => {
    console.error("[profile] upsertUser failed", err);
  });

  return NextResponse.json({ ok: true, user });
}

/**
 * PUT /api/user/profile
 * Update the authenticated user's profile (name, avatar).
 */
export async function PUT(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid profile data" }, { status: 400 });
  }

  const updated = await updateUser(auth.user.id, parsed.data);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: updated });
}
