import { type NextRequest, NextResponse } from "next/server";
import { getCurrentLocalUser, publicUser } from "@/lib/auth/local";
import { updateUser } from "@/lib/db/queries";
import { filterKnownPreferences, getUserPreferenceOptions } from "@/lib/user/preferences";

export async function GET(request: NextRequest) {
  const user = await getCurrentLocalUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  return NextResponse.json({ ok: true, user: publicUser(user) });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentLocalUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const bio = String(body?.bio || "").trim();
  const options = getUserPreferenceOptions();
  const knownTeamIds = new Set(options.teams.map((item) => item.id));
  const knownPlayerIds = new Set(options.players.map((item) => item.id));

  const updated = await updateUser(user.id, {
    name: name || null,
    bio: bio.slice(0, 300) || null,
    favoriteTeams: filterKnownPreferences(body?.favoriteTeams, knownTeamIds),
    favoritePlayers: filterKnownPreferences(body?.favoritePlayers, knownPlayerIds),
  });

  return NextResponse.json({ ok: true, user: updated ? publicUser(updated) : publicUser(user) });
}
