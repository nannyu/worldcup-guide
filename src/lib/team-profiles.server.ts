import { getStoredFifaPlayers } from "@/lib/db/queries/players";
import type { PlayerRecord } from "@/lib/db/schema/world-cup";
import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";
import type { PlayerProfile, Team } from "@/lib/wc-data";

let databaseTeamsCache: Team[] | undefined;

function ageFromDateOfBirth(dateOfBirth: string | Date | null): number | undefined {
  if (!dateOfBirth) return undefined;
  const born = dateOfBirth instanceof Date ? dateOfBirth : new Date(`${dateOfBirth}T00:00:00Z`);
  if (!Number.isFinite(born.getTime())) return undefined;
  const reference = new Date("2026-06-11T00:00:00Z");
  let age = reference.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    reference.getUTCMonth() < born.getUTCMonth()
    || (reference.getUTCMonth() === born.getUTCMonth() && reference.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : undefined;
}

function playerProfileFromRecord(record: PlayerRecord): PlayerProfile {
  const displayClub = record.clubZh || record.club || undefined;
  const career = [
    record.caps !== null || record.goals !== null
      ? `国家队履历：${record.caps ?? 0} 次出场 / ${record.goals ?? 0} 球`
      : "",
    record.dateOfBirth ? `出生日期：${record.dateOfBirth}` : "",
    record.club ? `官方俱乐部：${record.club}` : "",
  ].filter(Boolean);

  return {
    id: record.id,
    name: record.playerName,
    nameZh: record.nameZh || undefined,
    shirtNumber: record.shirtNumber,
    position: record.positionZh,
    club: displayClub,
    age: ageFromDateOfBirth(record.dateOfBirth),
    photoUrl: record.photoUrl || undefined,
    avatarUrl: record.avatarUrl || record.photoUrl || undefined,
    intro: `FIFA 官方名单第 ${record.shirtNumber} 号，司职${record.positionZh}${displayClub ? `，俱乐部：${displayClub}` : ""}。`,
    career,
  };
}

function applyDatabaseRoster(team: Team, rosterByCode: Map<string, PlayerProfile[]>): Team {
  if (!team.code) return team;
  const roster = rosterByCode.get(team.code);
  if (!roster?.length) return team;
  return {
    ...team,
    roster,
    source: `${team.source} · FIFA 官方球员 CSV 数据库`,
  };
}

export async function teamsWithPlayerProfilesFromOfficialSchedule(): Promise<Team[]> {
  const fallback = teamsWithBuiltInProfilesFromOfficialSchedule();
  if (databaseTeamsCache) return databaseTeamsCache;

  const storedPlayers = await getStoredFifaPlayers();
  if (!storedPlayers.length) return fallback;

  const rosterByCode = new Map<string, PlayerProfile[]>();
  for (const player of storedPlayers) {
    const roster = rosterByCode.get(player.teamCode) || [];
    roster.push(playerProfileFromRecord(player));
    rosterByCode.set(player.teamCode, roster);
  }

  databaseTeamsCache = fallback.map((team) => applyDatabaseRoster(team, rosterByCode));
  return databaseTeamsCache;
}
