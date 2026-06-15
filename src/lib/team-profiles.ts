import teamProfilesData from "@/data/team-profiles.json";
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

const builtInTeamProfiles = teamProfilesData as BuiltInTeamProfilesData;
const builtInTeamProfileByCode = new Map(
  builtInTeamProfiles.profiles.map((profile) => [profile.code, profile]),
);
let builtInTeamsCache: Team[] | undefined;

function normalizeLookupName(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function builtInTeams(): Team[] {
  builtInTeamsCache ||= teamsFromOfficialSchedule().map((team) => applyBuiltInTeamProfile(team));
  return builtInTeamsCache;
}

export function teamsWithBuiltInProfilesFromOfficialSchedule(): Team[] {
  return builtInTeams();
}

export function applyBuiltInTeamProfile(team: Team): Team {
  const profile = team.code ? builtInTeamProfileByCode.get(team.code) : undefined;
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

export function findBuiltInPlayerProfile(
  teamNameOrCode: string | undefined,
  player: { number?: number; name?: string; fullName?: string },
): PlayerProfile | undefined {
  const normalizedTeam = normalizeLookupName(teamNameOrCode);
  const team = builtInTeams().find((item) =>
    normalizeLookupName(item.code) === normalizedTeam
    || normalizeLookupName(item.name) === normalizedTeam
    || normalizeLookupName(item.nameEn) === normalizedTeam
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
