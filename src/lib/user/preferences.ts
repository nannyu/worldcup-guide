import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";

export interface PreferenceOption {
  id: string;
  label: string;
  description?: string;
}

export interface UserPreferenceOptions {
  teams: PreferenceOption[];
  players: PreferenceOption[];
}

export function getUserPreferenceOptions(): UserPreferenceOptions {
  const teams = teamsWithBuiltInProfilesFromOfficialSchedule();
  return {
    teams: teams
      .map((team) => ({
        id: team.code || team.id,
        label: `${team.flag} ${team.name}`,
        description: team.nameEn,
      }))
      .filter((team) => Boolean(team.id)),
    players: teams.flatMap((team) =>
      (team.starPlayers?.length ? team.starPlayers : team.roster?.slice(0, 6) || []).map((player) => {
        const rosterPlayer = team.roster?.find((item) => item.name === player.name);
        const id = rosterPlayer?.id || `${team.code || team.id}:${player.name}`;
        const nameZh = "nameZh" in player ? player.nameZh : rosterPlayer?.nameZh;
        return {
          id,
          label: nameZh ? `${nameZh} / ${player.name}` : player.name,
          description: `${team.name} · ${player.position}`,
        };
      })
    ),
  };
}

export function filterKnownPreferences(input: unknown, knownIds: Set<string>): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .filter((item): item is string => typeof item === "string")
        .filter((item) => knownIds.has(item))
    )
  );
}
