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

export function teamsWithBuiltInProfilesFromOfficialSchedule(): Team[] {
  return teamsFromOfficialSchedule().map((team) => applyBuiltInTeamProfile(team));
}

export function applyBuiltInTeamProfile(team: Team): Team {
  const profile = team.code ? builtInTeamProfileByCode.get(team.code) : undefined;
  if (!profile) return team;

  return {
    ...team,
    nameEn: profile.nameEn || team.nameEn,
    rank: profile.rank || team.rank,
    coach: profile.coach || team.coach,
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
