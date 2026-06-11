import { type NextRequest, NextResponse } from "next/server";
import { readAdminConfig, sanitizeAdminConfigForClient, writeAdminConfig } from "@/lib/admin/config";
import { unauthorizedResponse, verifyAdminRequest } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return unauthorizedResponse();
  const config = await readAdminConfig();
  return NextResponse.json({ ok: true, config: sanitizeAdminConfigForClient(config) });
}

export async function PUT(request: NextRequest) {
  if (!verifyAdminRequest(request)) return unauthorizedResponse();

  const body = (await request.json().catch(() => null)) as { config?: unknown } | null;
  if (!body?.config || typeof body.config !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_config" }, { status: 400 });
  }

  const config = await writeAdminConfig(body.config as Awaited<ReturnType<typeof readAdminConfig>>);
  return NextResponse.json({ ok: true, config: sanitizeAdminConfigForClient(config) });
}
