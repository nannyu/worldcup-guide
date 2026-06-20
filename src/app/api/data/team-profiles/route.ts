import { NextResponse } from "next/server";
import teamProfilesData from "@/data/team-profiles.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(teamProfilesData, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
  });
}
