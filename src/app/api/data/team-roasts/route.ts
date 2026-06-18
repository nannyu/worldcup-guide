import { type NextRequest, NextResponse } from "next/server";
import { getTeamRoastSnapshot } from "@/lib/ai/team-roasts";
import { teamsWithPlayerProfilesFromOfficialSchedule } from "@/lib/team-profiles.server";

export async function GET(request: NextRequest) {
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const teams = await teamsWithPlayerProfilesFromOfficialSchedule();
  const snapshot = await getTeamRoastSnapshot(teams, {
    cacheMode: refreshRequested ? "refresh" : "cache-only",
  });

  return NextResponse.json(
    {
      ok: true,
      cacheMode: refreshRequested ? "refresh" : "cache-only",
      snapshot,
      items: snapshot?.items || [],
      message: snapshot?.message || "球队毒舌快照尚未生成，等待定时刷新任务写入。",
    },
    {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=1800",
      },
    },
  );
}
