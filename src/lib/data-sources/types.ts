/**
 * Raw API response interfaces for all data sources.
 *
 * Extracted from aggregate.ts during the data-sources refactoring.
 * These are the wire-format shapes returned by external APIs;
 * they are intentionally loose (all-optional) so callers can
 * normalise them into the canonical Match / Team / NewsArticle
 * types from @/lib/wc-data.
 */

import { type MatchKitColors } from "@/lib/wc-data";
import { type AiNewsCuration } from "@/lib/ai/news-curation";
import { type SourceDiagnostic } from "@/lib/data-sources/client";
import {
  type MorningBrief,
  type MorningQuote,
  type NewsAggregationMeta,
  type NewsArticle,
} from "@/lib/wc-data";

// ---------------------------------------------------------------------------
// OpenFootball
// ---------------------------------------------------------------------------

export interface OpenFootballWorldCup {
  name: string;
  matches: Array<{
    round?: string;
    date?: string;
    time?: string;
    team1?: string;
    team2?: string;
    group?: string;
    ground?: string;
    score?: { ft?: [number, number] };
  }>;
}

// ---------------------------------------------------------------------------
// Polymarket
// ---------------------------------------------------------------------------

export interface PolymarketEvent {
  id?: string;
  title?: string;
  slug?: string;
  volume?: string | number;
  volume24hr?: string | number;
  markets?: Array<{
    id?: string;
    question?: string;
    outcomes?: string;
    outcomePrices?: string;
    volume?: string;
    groupItemTitle?: string;
    bestBid?: number;
    bestAsk?: number;
    lastTradePrice?: number;
    active?: boolean;
    closed?: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Football-Data.org
// ---------------------------------------------------------------------------

export interface FootballDataMatchesResponse {
  matches?: Array<{
    id?: number;
    utcDate?: string;
    status?: string;
    stage?: string;
    group?: string | null;
    matchday?: number | null;
    venue?: string | null;
    homeTeam?: { id?: number; name?: string; shortName?: string; tla?: string; crest?: string };
    awayTeam?: { id?: number; name?: string; shortName?: string; tla?: string; crest?: string };
    score?: {
      fullTime?: { home?: number | null; away?: number | null };
    };
  }>;
}

export interface FootballDataTeamsResponse {
  teams?: Array<{
    id?: number;
    name?: string;
    shortName?: string;
    tla?: string;
    crest?: string;
    coach?: { name?: string };
  }>;
}

// ---------------------------------------------------------------------------
// API-Football (api-football.com / RapidAPI)
// ---------------------------------------------------------------------------

export interface ApiFootballResponse<T> {
  response?: T[];
}

export interface ApiFootballFixture {
  fixture?: {
    id?: number;
    date?: string;
    venue?: { name?: string; city?: string };
    status?: { short?: string; long?: string; elapsed?: number | null };
  };
  league?: {
    round?: string;
  };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: { home?: number | null; away?: number | null };
  score?: {
    fulltime?: { home?: number | null; away?: number | null };
  };
  events?: ApiFootballEvent[];
  lineups?: ApiFootballLineup[];
  statistics?: ApiFootballStatisticGroup[];
}

export interface ApiFootballEvent {
  time?: { elapsed?: number | null; extra?: number | null };
  team?: { id?: number; name?: string };
  player?: { id?: number; name?: string };
  assist?: { id?: number; name?: string };
  type?: string;
  detail?: string;
  comments?: string | null;
}

export interface ApiFootballLineup {
  team?: { id?: number; name?: string; colors?: MatchKitColors };
  coach?: { id?: number; name?: string };
  formation?: string;
  startXI?: Array<{ player?: ApiFootballLineupPlayer }>;
  substitutes?: Array<{ player?: ApiFootballLineupPlayer }>;
}

export interface ApiFootballLineupPlayer {
  id?: number;
  name?: string;
  number?: number;
  pos?: string;
  grid?: string | null;
}

export interface ApiFootballStatisticGroup {
  team?: { id?: number; name?: string };
  statistics?: Array<{ type?: string; value?: string | number | null }>;
}

export interface ApiFootballTeamResponse {
  team?: {
    id?: number;
    name?: string;
    code?: string;
    country?: string;
    logo?: string;
  };
}

export interface ApiFootballOddsResponse {
  response?: ApiFootballOddsRecord[];
}

export interface ApiFootballOddsRecord {
  fixture?: {
    id?: number;
    date?: string;
  };
  update?: string;
  bookmakers?: Array<{
    id?: number;
    name?: string;
    bets?: Array<{
      id?: number;
      name?: string;
      values?: Array<{
        value?: string;
        odd?: string | number;
      }>;
    }>;
  }>;
}

export interface ApiFootballLiveOddsResponse {
  response?: ApiFootballLiveOddsRecord[];
}

export interface ApiFootballLiveOddsRecord {
  fixture?: {
    id?: number;
    date?: string;
  };
  league?: {
    id?: number;
    season?: number;
  };
  update?: string;
  bet?: {
    id?: number;
    name?: string;
  };
  odds?: Array<{
    value?: string;
    odd?: string | number;
  }>;
}

export interface ApiFootballPredictionResponse {
  response?: Array<{
    predictions?: {
      winner?: { id?: number | null; name?: string | null; comment?: string | null };
      win_or_draw?: boolean;
      under_over?: string | null;
      goals?: { home?: string | null; away?: string | null };
      advice?: string | null;
      percent?: { home?: string; draw?: string; away?: string };
    };
    teams?: {
      home?: { id?: number; name?: string; logo?: string };
      away?: { id?: number; name?: string; logo?: string };
    };
    fixture?: { id?: number };
  }>;
}

export interface ApiFootballStandingsResponse {
  response?: Array<{
    league?: {
      standings?: Array<Array<ApiFootballStandingRow>>;
    };
  }>;
}

export interface ApiFootballStandingRow {
  rank?: number;
  team?: { id?: number; name?: string; logo?: string };
  points?: number;
  goalsDiff?: number;
  group?: string;
  form?: string;
  status?: string;
  description?: string;
  all?: {
    played?: number;
    win?: number;
    draw?: number;
    lose?: number;
    goals?: { for?: number; against?: number };
  };
}

export interface ApiFootballSquadResponse {
  response?: Array<{
    team?: { id?: number; name?: string; logo?: string };
    players?: Array<{
      id?: number;
      name?: string;
      age?: number;
      number?: number;
      position?: string;
      photo?: string;
    }>;
  }>;
}

export interface ApiFootballInjuryResponse {
  response?: Array<{
    player?: { id?: number; name?: string; photo?: string; type?: string; reason?: string };
    team?: { id?: number; name?: string; logo?: string };
    fixture?: { id?: number; date?: string };
    league?: { id?: number; season?: number };
  }>;
}

// ---------------------------------------------------------------------------
// WorldCup API
// ---------------------------------------------------------------------------

export interface WorldCupApiFixture {
  id?: number;
  date?: string;
  time?: string;
  location?: string;
  round?: string;
  group_id?: number;
  home?: { id?: number; name?: string; logo?: string };
  away?: { id?: number; name?: string; logo?: string };
  odds?: { pre?: { "1"?: number | null; "2"?: number | null; X?: number | null } };
}

// ---------------------------------------------------------------------------
// TheSportsDB
// ---------------------------------------------------------------------------

export interface TheSportsDbEventsResponse {
  events?: Array<{
    idEvent?: string;
    dateEvent?: string;
    strTime?: string;
    strStatus?: string;
    strGroup?: string;
    intRound?: string;
    strVenue?: string;
    strCity?: string;
    strHomeTeam?: string;
    strAwayTeam?: string;
    intHomeScore?: string | null;
    intAwayScore?: string | null;
  }> | null;
}

export interface TheSportsDbTeamsResponse {
  teams?: Array<{
    idTeam?: string;
    strTeam?: string;
    strTeamShort?: string;
    strCountry?: string;
    strBadge?: string;
    strManager?: string;
    strDescriptionEN?: string;
  }> | null;
}

// ---------------------------------------------------------------------------
// Odds APIs
// ---------------------------------------------------------------------------

export interface TheOddsApiEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    title?: string;
    last_update?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{ name?: string; price?: number }>;
    }>;
  }>;
}

export interface OddsApiIoEvent {
  id?: string | number;
  home?: string;
  away?: string;
  date?: string;
  status?: string;
  bookmakers?: Record<string, Array<{
    name?: string;
    updatedAt?: string;
    odds?: Array<{
      home?: string | number;
      draw?: string | number;
      away?: string | number;
    }>;
  }>>;
}

// ---------------------------------------------------------------------------
// News / GDELT
// ---------------------------------------------------------------------------

export interface GdeltDocResponse {
  articles?: Array<{
    url?: string;
    title?: string;
    seendate?: string;
    socialimage?: string;
    domain?: string;
    language?: string;
    sourcecountry?: string;
  }>;
}

export interface NewsApiResponse {
  status?: string;
  totalResults?: number;
  articles?: Array<{
    source?: {
      id?: string | null;
      name?: string;
    };
    title?: string;
    description?: string | null;
    url?: string;
    urlToImage?: string | null;
    publishedAt?: string;
    content?: string | null;
  }>;
}

export interface CurrentsApiResponse {
  status?: string;
  page?: number;
  next_cursor?: string | null;
  news?: Array<{
    id?: string;
    title?: string;
    description?: string | null;
    url?: string;
    author?: string | null;
    image?: string | null;
    language?: string;
    category?: string[];
    source_category?: string[];
    published?: string;
  }>;
}

// ---------------------------------------------------------------------------
// ESPN
// ---------------------------------------------------------------------------

export interface EspnSiteNewsResponse {
  header?: string;
  articles?: Array<{
    id?: number | string;
    nowId?: string;
    type?: string;
    headline?: string;
    description?: string;
    lastModified?: string;
    published?: string;
    images?: Array<{
      url?: string;
      type?: string;
      name?: string;
      caption?: string;
    }>;
    categories?: Array<{
      type?: string;
      description?: string;
    }>;
    links?: {
      api?: {
        self?: {
          href?: string;
        };
      };
      web?: {
        href?: string;
      };
      mobile?: {
        href?: string;
      };
    };
  }>;
}

export interface EspnCoreNewsResponse {
  headlines?: Array<{
    id?: number | string;
    headline?: string;
    title?: string;
    description?: string;
    story?: string;
    images?: Array<{
      url?: string;
      type?: string;
      name?: string;
      caption?: string;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Snapshot payload types
// ---------------------------------------------------------------------------

export type NewsSnapshotPayload = {
  articles: NewsArticle[];
  articleIds?: string[];
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
  diagnostics: SourceDiagnostic[];
};

export type MorningBriefStoredPayload = MorningBrief | {
  schemaVersion: 2;
  brief: Omit<MorningBrief, "news">;
  articleIds: string[];
  newsPreview: NewsArticle[];
};

export type MorningQuoteSnapshotPayload = MorningQuote;
