import {
  teamsFromOfficialSchedule,
  type PlayerProfile,
  type Team,
  type TeamStarPlayer,
} from "@/lib/wc-data";

interface BuiltInTeamProfile {
  code: string;
  nameEn: string;
  rank: number;
  coach: string;
  coachZh?: string;
  formation: string;
  stars: string[];
  style: string;
  hotLevel: number;
  tags: string[];
  talkingPoints: string[];
  starPlayers: TeamStarPlayer[];
  roster: PlayerProfile[];
  roast: string;
  source: string;
}

interface BuiltInTeamProfilesData {
  profiles: BuiltInTeamProfile[];
}

function normalizeLookupName(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function applyBuiltInTeamProfile(profiles: Map<string, BuiltInTeamProfile>, team: Team): Team {
  const profile = team.code ? profiles.get(team.code) : undefined;
  if (!profile) return team;

  return {
    ...team,
    nameEn: profile.nameEn || team.nameEn,
    rank: profile.rank || team.rank,
    coach: profile.coach || team.coach,
    coachZh: profile.coachZh || team.coachZh,
    formation: profile.formation || team.formation,
    stars: profile.stars.length ? profile.stars : team.stars,
    style: profile.style || team.style,
    hotLevel: profile.hotLevel || team.hotLevel,
    tags: profile.tags.length ? profile.tags : team.tags,
    talkingPoints: profile.talkingPoints.length ? profile.talkingPoints : team.talkingPoints,
    starPlayers: profile.starPlayers.length ? profile.starPlayers : team.starPlayers,
    roster: profile.roster.length ? profile.roster : team.roster,
    roast: profile.roast || team.roast,
    source: `${team.source} · ${profile.source}`,
  };
}

let cachedProfiles: Map<string, BuiltInTeamProfile> | null = null;

async function loadProfiles(): Promise<Map<string, BuiltInTeamProfile>> {
  if (cachedProfiles) return cachedProfiles;
  try {
    const res = await fetch("/api/data/team-profiles", { cache: "force-cache" });
    if (!res.ok) return new Map();
    const data = (await res.json()) as BuiltInTeamProfilesData;
    cachedProfiles = new Map(data.profiles.map((p) => [p.code, p]));
    return cachedProfiles;
  } catch {
    return new Map();
  }
}

export async function fetchTeamsWithProfiles(): Promise<Team[]> {
  const profiles = await loadProfiles();
  return teamsFromOfficialSchedule().map((team) => applyBuiltInTeamProfile(profiles, team));
}

export function findBuiltInPlayerProfile(
  profiles: Map<string, BuiltInTeamProfile>,
  teamNameOrCode: string | undefined,
  player: { number?: number; name?: string; fullName?: string },
): PlayerProfile | undefined {
  const normalizedTeam = normalizeLookupName(teamNameOrCode);
  const teams = Array.from(profiles.values());
  const team = teams.find((item) =>
    normalizeLookupName(item.code) === normalizedTeam
  );
  if (!team?.roster?.length) return undefined;

  if (player.number !== undefined) {
    const byNumber = team.roster.find((item) => item.shirtNumber === player.number);
    if (byNumber) return byNumber;
  }

  const normalizedPlayerNames = [
    normalizeLookupName(player.fullName),
    normalizeLookupName(player.name),
  ].filter(Boolean);
  return team.roster.find((item) => normalizedPlayerNames.includes(normalizeLookupName(item.name)));
}
