import type { DataSourceConfig } from "@/lib/admin/config";
import { fetchJsonFromSource, type SourceDiagnostic } from "../client";
import {
  ENGLAND_FLAG,
  SCOTLAND_FLAG,
  type Team,
  type TeamInjury,
} from "@/lib/wc-data";
import type {
  FootballDataTeamsResponse,
  ApiFootballResponse,
  ApiFootballTeamResponse,
  ApiFootballStandingsResponse,
  ApiFootballSquadResponse,
  ApiFootballInjuryResponse,
  TheSportsDbTeamsResponse,
} from "../types";

// ---------------------------------------------------------------------------
// Team name / display helpers
// ---------------------------------------------------------------------------

const teamZh: Record<string, { name: string; flag: string }> = {
  Algeria: { name: "阿尔及利亚", flag: "🇩🇿" },
  Austria: { name: "奥地利", flag: "🇦🇹" },
  Australia: { name: "澳大利亚", flag: "🇦🇺" },
  Belgium: { name: "比利时", flag: "🇧🇪" },
  "Bosnia-Herzegovina": { name: "波黑", flag: "🇧🇦" },
  "Bosnia & Herzegovina": { name: "波黑", flag: "🇧🇦" },
  "Cape Verde": { name: "佛得角", flag: "🇨🇻" },
  "Cape Verde Islands": { name: "佛得角", flag: "🇨🇻" },
  "Cabo Verde": { name: "佛得角", flag: "🇨🇻" },
  Colombia: { name: "哥伦比亚", flag: "🇨🇴" },
  Croatia: { name: "克罗地亚", flag: "🇭🇷" },
  Curacao: { name: "库拉索", flag: "🇨🇼" },
  Curaçao: { name: "库拉索", flag: "🇨🇼" },
  "Côte d'Ivoire": { name: "科特迪瓦", flag: "🇨🇮" },
  Ecuador: { name: "厄瓜多尔", flag: "🇪🇨" },
  Egypt: { name: "埃及", flag: "🇪🇬" },
  England: { name: "英格兰", flag: ENGLAND_FLAG },
  Ghana: { name: "加纳", flag: "🇬🇭" },
  Haiti: { name: "海地", flag: "🇭🇹" },
  Iran: { name: "伊朗", flag: "🇮🇷" },
  Iraq: { name: "伊拉克", flag: "🇮🇶" },
  Jordan: { name: "约旦", flag: "🇯🇴" },
  "New Zealand": { name: "新西兰", flag: "🇳🇿" },
  Norway: { name: "挪威", flag: "🇳🇴" },
  Panama: { name: "巴拿马", flag: "🇵🇦" },
  Paraguay: { name: "巴拉圭", flag: "🇵🇾" },
  Portugal: { name: "葡萄牙", flag: "🇵🇹" },
  Qatar: { name: "卡塔尔", flag: "🇶🇦" },
  "Saudi Arabia": { name: "沙特阿拉伯", flag: "🇸🇦" },
  Scotland: { name: "苏格兰", flag: SCOTLAND_FLAG },
  Senegal: { name: "塞内加尔", flag: "🇸🇳" },
  Sweden: { name: "瑞典", flag: "🇸🇪" },
  Switzerland: { name: "瑞士", flag: "🇨🇭" },
  Tunisia: { name: "突尼斯", flag: "🇹🇳" },
  Turkey: { name: "土耳其", flag: "🇹🇷" },
  Türkiye: { name: "土耳其", flag: "🇹🇷" },
  Uruguay: { name: "乌拉圭", flag: "🇺🇾" },
  Uzbekistan: { name: "乌兹别克斯坦", flag: "🇺🇿" },
  Mexico: { name: "墨西哥", flag: "🇲🇽" },
  "South Africa": { name: "南非", flag: "🇿🇦" },
  "South Korea": { name: "韩国", flag: "🇰🇷" },
  "Czech Republic": { name: "捷克", flag: "🇨🇿" },
  Czechia: { name: "捷克", flag: "🇨🇿" },
  Canada: { name: "加拿大", flag: "🇨🇦" },
  Netherlands: { name: "荷兰", flag: "🇳🇱" },
  Argentina: { name: "阿根廷", flag: "🇦🇷" },
  Brazil: { name: "巴西", flag: "🇧🇷" },
  France: { name: "法国", flag: "🇫🇷" },
  Germany: { name: "德国", flag: "🇩🇪" },
  Spain: { name: "西班牙", flag: "🇪🇸" },
  Morocco: { name: "摩洛哥", flag: "🇲🇦" },
  Japan: { name: "日本", flag: "🇯🇵" },
  "Congo DR": { name: "刚果民主共和国", flag: "🇨🇩" },
  "DR Congo": { name: "刚果民主共和国", flag: "🇨🇩" },
  "Ivory Coast": { name: "科特迪瓦", flag: "🇨🇮" },
  "United States": { name: "美国", flag: "🇺🇸" },
  USA: { name: "美国", flag: "🇺🇸" },
};

const englishNameByZh = new Map(
  Object.entries(teamZh).map(([english, display]) => [display.name, english]),
);

export function getTeam(input: string | undefined) {
  if (!input) return { name: "待定", flag: "🏳️" };
  return teamZh[input] || { name: input, flag: "🏳️" };
}

export function canonicalTeamName(input: string | undefined): string {
  const english = input ? englishNameByZh.get(input) || input : "";
  const normalized = english
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(fc|cf|national team)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    caboverde: "capeverde",
    capeverdeislands: "capeverde",
  };
  return aliases[normalized] || normalized;
}

// ---------------------------------------------------------------------------
// Source-specific transformer functions
// ---------------------------------------------------------------------------

export function transformFootballDataTeams(data: FootballDataTeamsResponse): Team[] {
  return (data.teams || []).map((team) => {
    const display = getTeam(team.name || team.shortName);
    return {
      id: `football-data-${team.id}`,
      name: display.name,
      nameEn: team.name || team.shortName || "",
      flag: display.flag,
      group: "",
      rank: 0,
      coach: team.coach?.name || "",
      formation: "",
      stars: [],
      style: "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
      crestUrl: team.crest,
      source: "football-data.org",
    };
  });
}

export function transformApiFootballTeams(data: ApiFootballResponse<ApiFootballTeamResponse>): Team[] {
  return (data.response || []).map((item) => {
    const display = getTeam(item.team?.name);
    return {
      id: `api-football-${item.team?.id}`,
      providerTeamId: item.team?.id,
      code: item.team?.code,
      name: display.name,
      nameEn: item.team?.name || "",
      flag: display.flag,
      group: "",
      rank: 0,
      coach: "",
      formation: "",
      stars: [],
      style: "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
      crestUrl: item.team?.logo,
      source: "API-Football Pro",
      sourceUpdatedAt: new Date().toISOString(),
    };
  });
}

export function apiFootballGroupLabel(group: string | undefined): string {
  const letter = String(group || "").match(/Group\s+([A-Z])/i)?.[1] || String(group || "").match(/\b([A-Z])\b/)?.[1];
  return letter ? `${letter} 组` : group || "";
}

export function uniqueLabels(items: Array<string | undefined>): string[] {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

export function mergeSourceLabels(...sources: Array<string | undefined>): string {
  return uniqueLabels(sources.flatMap((source) => source?.split(" · ") || [])).join(" · ");
}

export function teamMergeKeys(teamId: number | undefined, name: string | undefined): string[] {
  return [
    teamId ? `id:${teamId}` : "",
    canonicalTeamName(name),
  ].filter(Boolean);
}

export function transformApiFootballStandings(data: ApiFootballStandingsResponse): Map<string, Partial<Team>> {
  const byKey = new Map<string, Partial<Team>>();
  for (const row of data.response?.flatMap((item) => item.league?.standings?.flat() || []) || []) {
    const partial: Partial<Team> = {
      providerTeamId: row.team?.id,
      group: apiFootballGroupLabel(row.group),
      rank: row.rank || 0,
      groupStandings: {
        played: row.all?.played || 0,
        won: row.all?.win || 0,
        drawn: row.all?.draw || 0,
        lost: row.all?.lose || 0,
        goalsFor: row.all?.goals?.for || 0,
        goalsAgainst: row.all?.goals?.against || 0,
        pts: row.points || 0,
      },
      formSummary: {
        form: row.form,
        lastFive: row.form ? row.form.split("").slice(-5) : [],
        note: [row.description, row.status ? `status: ${row.status}` : ""].filter(Boolean).join(" · "),
        updatedAt: new Date().toISOString(),
      },
      crestUrl: row.team?.logo,
      sourceUpdatedAt: new Date().toISOString(),
    };
    for (const key of teamMergeKeys(row.team?.id, row.team?.name)) byKey.set(key, partial);
  }
  return byKey;
}

export function transformApiFootballSquads(data: ApiFootballSquadResponse): Map<string, Team["roster"]> {
  const byKey = new Map<string, Team["roster"]>();
  for (const item of data.response || []) {
    const roster = (item.players || [])
      .filter((player) => player.name)
      .map((player) => ({
        id: `api-football-player-${player.id || `${item.team?.id}-${player.name}`}`,
        name: player.name || "",
        shirtNumber: player.number,
        position: player.position || "",
        age: player.age,
        photoUrl: player.photo,
        avatarUrl: player.photo,
        intro: "API-Football Pro squad profile.",
      }));
    for (const key of teamMergeKeys(item.team?.id, item.team?.name)) byKey.set(key, roster);
  }
  return byKey;
}

export function transformApiFootballInjuries(data: ApiFootballInjuryResponse): Map<string, TeamInjury[]> {
  const byKey = new Map<string, TeamInjury[]>();
  for (const item of data.response || []) {
    if (!item.player?.name) continue;
    const injury: TeamInjury = {
      id: `api-football-injury-${item.fixture?.id || "fixture"}-${item.player.id || item.player.name}`,
      playerName: item.player.name,
      playerId: item.player.id,
      type: item.player.type,
      reason: item.player.reason,
      fixtureId: item.fixture?.id,
      fixtureDate: item.fixture?.date,
      updatedAt: new Date().toISOString(),
    };
    for (const key of teamMergeKeys(item.team?.id, item.team?.name)) {
      byKey.set(key, [...(byKey.get(key) || []), injury]);
    }
  }
  return byKey;
}

export function mergeApiFootballTeamAuxData(
  teams: Team[],
  input: {
    standings?: Map<string, Partial<Team>>;
    squads?: Map<string, Team["roster"]>;
    injuries?: Map<string, TeamInjury[]>;
  },
): Team[] {
  return teams.map((team) => {
    const keys = teamMergeKeys(team.providerTeamId, team.nameEn || team.name);
    const standings = keys.map((key) => input.standings?.get(key)).find(Boolean);
    const roster = keys.map((key) => input.squads?.get(key)).find(Boolean);
    const injuries = keys.map((key) => input.injuries?.get(key)).find(Boolean);
    return {
      ...team,
      providerTeamId: team.providerTeamId || standings?.providerTeamId,
      group: team.group || standings?.group || "",
      rank: standings?.rank || team.rank,
      crestUrl: team.crestUrl || standings?.crestUrl,
      groupStandings: standings?.groupStandings || team.groupStandings,
      formSummary: standings?.formSummary || team.formSummary,
      roster: roster?.length ? roster : team.roster,
      injuries: injuries?.length ? injuries : team.injuries,
      tags: uniqueLabels([
        ...team.tags,
        standings?.rank ? `小组第${standings.rank}` : "",
        injuries?.length ? `${injuries.length}人伤停` : "",
      ]),
      source: mergeSourceLabels(team.source, standings || roster || injuries ? "API-Football Pro · standings/squads/injuries" : undefined),
      sourceUpdatedAt: new Date().toISOString(),
    };
  });
}

export function transformTheSportsDbTeams(data: TheSportsDbTeamsResponse): Team[] {
  return (data.teams || []).map((team) => {
    const display = getTeam(team.strTeam);
    return {
      id: `thesportsdb-${team.idTeam}`,
      name: display.name,
      nameEn: team.strTeam || "",
      flag: display.flag,
      group: "",
      rank: 0,
      coach: team.strManager || "",
      formation: "",
      stars: [],
      style: team.strDescriptionEN || "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
      crestUrl: team.strBadge,
      source: "TheSportsDB",
    };
  });
}

// ---------------------------------------------------------------------------
// Team identity / merge helpers
// ---------------------------------------------------------------------------

export function teamIdentityKeys(team: Partial<Pick<Team, "providerTeamId" | "code" | "name" | "nameEn">>): string[] {
  return Array.from(new Set([
    team.providerTeamId ? `id:${team.providerTeamId}` : "",
    team.code ? `code:${team.code}` : "",
    canonicalTeamName(team.nameEn),
    canonicalTeamName(team.name),
  ].filter(Boolean)));
}

export function mergeTeamLists(lists: Team[][]): Team[] {
  const merged = new Map<string, Team>();
  const keyIndex = new Map<string, string>();
  for (const teams of lists) {
    for (const team of teams) {
      const keys = teamIdentityKeys(team);
      const key = keys.map((item) => keyIndex.get(item)).find(Boolean) || keys[0];
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, team);
        for (const item of keys) keyIndex.set(item, key);
        continue;
      }
      const nextTeam = {
        ...existing,
        providerTeamId: existing.providerTeamId || team.providerTeamId,
        code: existing.code || team.code,
        coach: existing.coach || team.coach,
        formation: existing.formation || team.formation,
        style: existing.style || team.style,
        crestUrl: existing.crestUrl || team.crestUrl,
        group: existing.group || team.group,
        rank: existing.rank || team.rank,
        groupStandings: existing.groupStandings?.played || existing.groupStandings?.pts
          ? existing.groupStandings
          : team.groupStandings,
        stars: existing.stars.length ? existing.stars : team.stars,
        tags: Array.from(new Set([...existing.tags, ...team.tags])),
        talkingPoints: Array.from(new Set([...existing.talkingPoints, ...team.talkingPoints])),
        roster: existing.roster?.length ? existing.roster : team.roster,
        injuries: existing.injuries?.length ? existing.injuries : team.injuries,
        formSummary: existing.formSummary || team.formSummary,
        sourceUpdatedAt: existing.sourceUpdatedAt || team.sourceUpdatedAt,
        source: Array.from(new Set([existing.source, team.source].filter(Boolean))).join(" + "),
      };
      merged.set(key, nextTeam);
      for (const item of teamIdentityKeys(nextTeam)) keyIndex.set(item, key);
    }
  }
  return Array.from(merged.values());
}

// ---------------------------------------------------------------------------
// Enrichment (async fetch + merge)
// ---------------------------------------------------------------------------

export async function enrichApiFootballTeamsWithAuxSources(
  teams: Team[],
  dataSources: DataSourceConfig[],
  diagnostics: SourceDiagnostic[],
): Promise<Team[]> {
  if (!teams.length) return teams;
  const standingsSource = enabledSourceById(dataSources, "api-football-worldcup-standings");
  const squadsSource = enabledSourceById(dataSources, "api-football-worldcup-squads");
  const injuriesSource = enabledSourceById(dataSources, "api-football-worldcup-injuries");
  const aux: Parameters<typeof mergeApiFootballTeamAuxData>[1] = {};

  if (standingsSource) {
    try {
      const { data, diagnostic } = await fetchJsonFromSource<ApiFootballStandingsResponse>(standingsSource, {
        league: 1,
        season: 2026,
      });
      diagnostics.push(diagnostic);
      aux.standings = transformApiFootballStandings(data);
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  if (injuriesSource) {
    try {
      const { data, diagnostic } = await fetchJsonFromSource<ApiFootballInjuryResponse>(injuriesSource, {
        league: 1,
        season: 2026,
      });
      diagnostics.push(diagnostic);
      aux.injuries = transformApiFootballInjuries(data);
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  if (squadsSource) {
    const squads = new Map<string, Team["roster"]>();
    const teamIds = Array.from(new Set(
      teams.map((team) => team.providerTeamId).filter((id): id is number => Number.isFinite(id)),
    )).slice(0, 64);

    const BATCH_SIZE = 8;
    const batches: number[][] = [];
    for (let i = 0; i < teamIds.length; i += BATCH_SIZE) {
      batches.push(teamIds.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.allSettled(
      batches.map(async (batch) => {
        const batchSquads = new Map<string, Team["roster"]>();
        for (const teamId of batch) {
          try {
            const { data, diagnostic } = await fetchJsonFromSource<ApiFootballSquadResponse>(squadsSource, {
              team: teamId,
            });
            diagnostics.push(diagnostic);
            for (const [key, roster] of transformApiFootballSquads(data).entries()) {
              batchSquads.set(key, roster);
            }
          } catch (error) {
            diagnostics.push(error as SourceDiagnostic);
          }
        }
        return batchSquads;
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        for (const [key, roster] of result.value) squads.set(key, roster);
      }
    }
    aux.squads = squads;
  }

  return mergeApiFootballTeamAuxData(teams, aux);
}

// ---------------------------------------------------------------------------
// enabledSourceById (local copy for self-contained module)
// ---------------------------------------------------------------------------

function enabledSourceById(dataSources: DataSourceConfig[], id: string): DataSourceConfig | undefined {
  return dataSources.find((source) => source.id === id && source.enabled && source.apiKey);
}
