import { findBuiltInPlayerProfile } from "@/lib/team-profiles";
import { isZh } from "@/lib/i18n/content";
import type { Match, MatchEvent, MatchLineup, MatchLineupPlayer, PlayerProfile, Team, TeamInjury } from "@/lib/wc-data";

export function normalizePlayerLookup(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function enrichedLineupPlayer(lineup: MatchLineup, player: MatchLineupPlayer): MatchLineupPlayer {
  const profile = findBuiltInPlayerProfile(lineup.teamName, player);
  return {
    ...player,
    nameZh: profile ? profile.nameZh : player.nameZh,
    fullName: profile ? profile.name : player.fullName,
  };
}

export function displayLineupPlayerName(player: MatchLineupPlayer, lineup: MatchLineup, locale: string): string {
  const enriched = enrichedLineupPlayer(lineup, player);
  return isZh(locale)
    ? enriched.nameZh || enriched.fullName || enriched.name
    : enriched.fullName || enriched.name;
}

export function secondaryLineupPlayerName(player: MatchLineupPlayer, lineup: MatchLineup, locale: string): string | undefined {
  const enriched = enrichedLineupPlayer(lineup, player);
  const english = enriched.fullName || enriched.name;
  if (!isZh(locale) || !enriched.nameZh || normalizePlayerLookup(enriched.nameZh) === normalizePlayerLookup(english)) {
    return undefined;
  }
  return english;
}

export function samePlayer(left: MatchLineupPlayer, eventName: string | undefined, eventId?: number): boolean {
  if (eventId && left.id && eventId === left.id) return true;
  const candidates = [left.name, left.fullName, left.nameZh].map(normalizePlayerLookup).filter(Boolean);
  return candidates.includes(normalizePlayerLookup(eventName));
}

function eventFallbackTeamName(match: Match, event: MatchEvent): string | undefined {
  return event.team === "home" ? match.homeCode || match.homeTeam : match.awayCode || match.awayTeam;
}

export function displayMatchEventPlayerName(
  match: Match,
  event: MatchEvent,
  locale: string,
  role: "player" | "assist" = "player",
): string {
  const lineup = match.lineups?.find((item) => item.team === event.team);
  const rawName = role === "assist" ? event.assistPlayer : event.player;
  const rawId = role === "assist" ? event.assistPlayerId : event.playerId;
  if (lineup) {
    const player = [...lineup.startXI, ...lineup.substitutes]
      .map((item) => enrichedLineupPlayer(lineup, item))
      .find((item) => samePlayer(item, rawName, rawId));
    if (player) return displayLineupPlayerName(player, lineup, locale);
  }

  if (isZh(locale)) {
    const profile = findBuiltInPlayerProfile(eventFallbackTeamName(match, event), {
      name: rawName,
      fullName: rawName,
      number: undefined,
    });
    if (profile?.nameZh) return profile.nameZh;
  }

  return rawName || "";
}

export function displayPlayerProfileName(player: PlayerProfile, locale: string): string {
  return isZh(locale) && player.nameZh ? player.nameZh : player.name;
}

export function secondaryPlayerProfileInfo(player: PlayerProfile, locale: string): string {
  return [
    isZh(locale) && player.nameZh ? player.name : "",
    player.position,
  ].filter(Boolean).join(" · ");
}

export function displayTeamInjuryPlayerName(team: Team, injury: TeamInjury, locale: string): string {
  if (!isZh(locale)) return injury.playerName;
  if (injury.playerNameZh) return injury.playerNameZh;
  const profile = findBuiltInPlayerProfile(team.code || team.name || team.nameEn, {
    name: injury.playerName,
    fullName: injury.playerName,
  });
  return profile?.nameZh || injury.playerName;
}
