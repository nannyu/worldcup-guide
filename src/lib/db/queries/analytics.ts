import { and, desc, gte, lt } from "drizzle-orm";
import { getDb, getSql, isDatabaseConfigured } from "@/lib/db/client";
import { analyticsEvents } from "@/lib/db/schema/analytics";
import type { AnalyticsEventInput } from "@/lib/analytics/events";

export type AnalyticsTotals = {
  events: number;
  pageViews: number;
  clicks: number;
  sessions: number;
  uniqueVisitors: number;
  uniqueIps: number;
  averageDurationSeconds: number;
  totalDurationSeconds: number;
};

export type AnalyticsTrendPoint = {
  bucket: string;
  pageViews: number;
  clicks: number;
  uniqueVisitors: number;
  averageDurationSeconds: number;
};

export type AnalyticsFeatureRow = {
  feature: string;
  pageViews: number;
  clicks: number;
  uniqueVisitors: number;
  averageDurationSeconds: number;
  totalDurationSeconds: number;
};

export type AnalyticsPageRow = {
  path: string;
  feature: string;
  pageViews: number;
  clicks: number;
  uniqueVisitors: number;
  averageDurationSeconds: number;
  totalDurationSeconds: number;
};

export type AnalyticsClickRow = {
  targetLabel: string;
  targetType: string;
  path: string;
  feature: string;
  targetHref?: string | null;
  clicks: number;
  uniqueVisitors: number;
};

export type AnalyticsIpRow = {
  ipAddress: string;
  pageViews: number;
  clicks: number;
  sessions: number;
  uniqueVisitors: number;
  lastSeenAt: string;
};

export type AnalyticsRecentEvent = {
  eventType: string;
  feature: string;
  path: string;
  targetLabel?: string | null;
  targetType?: string | null;
  ipAddress?: string | null;
  durationSeconds?: number | null;
  occurredAt: string;
};

export type AnalyticsReport = {
  generatedAt: string;
  range: {
    from: string;
    to: string;
    days: number;
  };
  storage: "database" | "disabled" | "unavailable";
  totals: AnalyticsTotals;
  trends: AnalyticsTrendPoint[];
  features: AnalyticsFeatureRow[];
  pages: AnalyticsPageRow[];
  clicks: AnalyticsClickRow[];
  ips: AnalyticsIpRow[];
  recentEvents: AnalyticsRecentEvent[];
};

type RawTotals = {
  events: number | string | null;
  page_views: number | string | null;
  clicks: number | string | null;
  sessions: number | string | null;
  unique_visitors: number | string | null;
  unique_ips: number | string | null;
  average_duration_ms: number | string | null;
  total_duration_ms: number | string | null;
};

type RawTrend = {
  bucket: Date | string;
  page_views: number | string | null;
  clicks: number | string | null;
  unique_visitors: number | string | null;
  average_duration_ms: number | string | null;
};

type RawFeature = {
  feature: string;
  page_views: number | string | null;
  clicks: number | string | null;
  unique_visitors: number | string | null;
  average_duration_ms: number | string | null;
  total_duration_ms: number | string | null;
};

type RawPage = RawFeature & {
  path: string;
};

type RawClick = {
  target_label: string | null;
  target_type: string | null;
  path: string;
  feature: string;
  target_href: string | null;
  clicks: number | string | null;
  unique_visitors: number | string | null;
};

type RawIp = {
  ip_address: string | null;
  page_views: number | string | null;
  clicks: number | string | null;
  sessions: number | string | null;
  unique_visitors: number | string | null;
  last_seen_at: Date | string;
};

function toNumber(value: number | string | null | undefined): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function seconds(ms: number | string | null | undefined): number {
  return Math.round((toNumber(ms) / 1000) * 10) / 10;
}

function emptyReport(
  from: Date,
  to: Date,
  days: number,
  storage: AnalyticsReport["storage"] = "disabled",
): AnalyticsReport {
  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString(), days },
    storage,
    totals: {
      events: 0,
      pageViews: 0,
      clicks: 0,
      sessions: 0,
      uniqueVisitors: 0,
      uniqueIps: 0,
      averageDurationSeconds: 0,
      totalDurationSeconds: 0,
    },
    trends: [],
    features: [],
    pages: [],
    clicks: [],
    ips: [],
    recentEvents: [],
  };
}

export async function recordAnalyticsEvents(events: AnalyticsEventInput[]): Promise<number> {
  if (!events.length || !isDatabaseConfigured) return 0;
  try {
    await getDb()
      .insert(analyticsEvents)
      .values(events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        feature: event.feature,
        path: event.path,
        title: event.title,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        visitorKey: event.visitorKey,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        referrer: event.referrer,
        targetType: event.targetType,
        targetLabel: event.targetLabel,
        targetHref: event.targetHref,
        durationMs: event.durationMs,
        metadata: event.metadata,
        occurredAt: event.occurredAt,
      })))
      .onConflictDoNothing();
    return events.length;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[analytics] write skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return 0;
  }
}

export async function getAnalyticsReport(days = 7): Promise<AnalyticsReport> {
  const normalizedDays = Math.max(1, Math.min(90, Math.round(days)));
  const to = new Date();
  const from = new Date(to.getTime() - normalizedDays * 24 * 60 * 60 * 1000);

  if (!isDatabaseConfigured) return emptyReport(from, to, normalizedDays);

  const sql = getSql();
  const bucketUnit = normalizedDays <= 2 ? "hour" : "day";

  let queryResults: [
    RawTotals[],
    RawTrend[],
    RawFeature[],
    RawPage[],
    RawClick[],
    RawIp[],
    Array<{
      eventType: string;
      feature: string;
      path: string;
      targetLabel: string | null;
      targetType: string | null;
      ipAddress: string | null;
      durationMs: number | null;
      occurredAt: Date;
    }>,
  ];

  try {
    queryResults = await Promise.all([
      sql<RawTotals[]>`
        select
          count(*) as events,
          count(*) filter (where event_type = 'page_view') as page_views,
          count(*) filter (where event_type = 'click') as clicks,
          count(distinct session_id) as sessions,
          count(distinct visitor_key) as unique_visitors,
          count(distinct ip_address) filter (where ip_address is not null and ip_address <> '') as unique_ips,
          coalesce(avg(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as average_duration_ms,
          coalesce(sum(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as total_duration_ms
        from analytics_events
        where occurred_at >= ${from} and occurred_at < ${to}
      `,
      sql<RawTrend[]>`
        select
          date_trunc(${bucketUnit}, occurred_at) as bucket,
          count(*) filter (where event_type = 'page_view') as page_views,
          count(*) filter (where event_type = 'click') as clicks,
          count(distinct visitor_key) as unique_visitors,
          coalesce(avg(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as average_duration_ms
        from analytics_events
        where occurred_at >= ${from} and occurred_at < ${to}
        group by bucket
        order by bucket asc
      `,
      sql<RawFeature[]>`
        select
          feature,
          count(*) filter (where event_type = 'page_view') as page_views,
          count(*) filter (where event_type = 'click') as clicks,
          count(distinct visitor_key) as unique_visitors,
          coalesce(avg(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as average_duration_ms,
          coalesce(sum(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as total_duration_ms
        from analytics_events
        where occurred_at >= ${from} and occurred_at < ${to}
        group by feature
        order by page_views desc, clicks desc, unique_visitors desc
        limit 20
      `,
      sql<RawPage[]>`
        select
          path,
          min(feature) as feature,
          count(*) filter (where event_type = 'page_view') as page_views,
          count(*) filter (where event_type = 'click') as clicks,
          count(distinct visitor_key) as unique_visitors,
          coalesce(avg(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as average_duration_ms,
          coalesce(sum(duration_ms) filter (where event_type = 'page_leave' and duration_ms > 0), 0) as total_duration_ms
        from analytics_events
        where occurred_at >= ${from} and occurred_at < ${to}
        group by path
        order by page_views desc, clicks desc, unique_visitors desc
        limit 30
      `,
      sql<RawClick[]>`
        select
          coalesce(nullif(target_label, ''), target_href, target_type, '未命名点击') as target_label,
          coalesce(target_type, 'unknown') as target_type,
          path,
          min(feature) as feature,
          max(target_href) as target_href,
          count(*) as clicks,
          count(distinct visitor_key) as unique_visitors
        from analytics_events
        where occurred_at >= ${from} and occurred_at < ${to}
          and event_type = 'click'
        group by coalesce(nullif(target_label, ''), target_href, target_type, '未命名点击'), coalesce(target_type, 'unknown'), path
        order by clicks desc, unique_visitors desc
        limit 30
      `,
      sql<RawIp[]>`
        select
          coalesce(nullif(ip_address, ''), 'unknown') as ip_address,
          count(*) filter (where event_type = 'page_view') as page_views,
          count(*) filter (where event_type = 'click') as clicks,
          count(distinct session_id) as sessions,
          count(distinct visitor_key) as unique_visitors,
          max(occurred_at) as last_seen_at
        from analytics_events
        where occurred_at >= ${from} and occurred_at < ${to}
        group by ip_address
        order by page_views desc, clicks desc, last_seen_at desc
        limit 30
      `,
      getDb()
        .select({
          eventType: analyticsEvents.eventType,
          feature: analyticsEvents.feature,
          path: analyticsEvents.path,
          targetLabel: analyticsEvents.targetLabel,
          targetType: analyticsEvents.targetType,
          ipAddress: analyticsEvents.ipAddress,
          durationMs: analyticsEvents.durationMs,
          occurredAt: analyticsEvents.occurredAt,
        })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.occurredAt, from), lt(analyticsEvents.occurredAt, to)))
        .orderBy(desc(analyticsEvents.occurredAt))
        .limit(30),
    ]);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[analytics] report unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return emptyReport(from, to, normalizedDays, "unavailable");
  }

  const [totalsRows, trendRows, featureRows, pageRows, clickRows, ipRows, recentRows] = queryResults;

  const totals = totalsRows[0] || {
    events: 0,
    page_views: 0,
    clicks: 0,
    sessions: 0,
    unique_visitors: 0,
    unique_ips: 0,
    average_duration_ms: 0,
    total_duration_ms: 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString(), days: normalizedDays },
    storage: "database",
    totals: {
      events: toNumber(totals.events),
      pageViews: toNumber(totals.page_views),
      clicks: toNumber(totals.clicks),
      sessions: toNumber(totals.sessions),
      uniqueVisitors: toNumber(totals.unique_visitors),
      uniqueIps: toNumber(totals.unique_ips),
      averageDurationSeconds: seconds(totals.average_duration_ms),
      totalDurationSeconds: seconds(totals.total_duration_ms),
    },
    trends: trendRows.map((row) => ({
      bucket: toIso(row.bucket),
      pageViews: toNumber(row.page_views),
      clicks: toNumber(row.clicks),
      uniqueVisitors: toNumber(row.unique_visitors),
      averageDurationSeconds: seconds(row.average_duration_ms),
    })),
    features: featureRows.map((row) => ({
      feature: row.feature,
      pageViews: toNumber(row.page_views),
      clicks: toNumber(row.clicks),
      uniqueVisitors: toNumber(row.unique_visitors),
      averageDurationSeconds: seconds(row.average_duration_ms),
      totalDurationSeconds: seconds(row.total_duration_ms),
    })),
    pages: pageRows.map((row) => ({
      path: row.path,
      feature: row.feature,
      pageViews: toNumber(row.page_views),
      clicks: toNumber(row.clicks),
      uniqueVisitors: toNumber(row.unique_visitors),
      averageDurationSeconds: seconds(row.average_duration_ms),
      totalDurationSeconds: seconds(row.total_duration_ms),
    })),
    clicks: clickRows.map((row) => ({
      targetLabel: row.target_label || "未命名点击",
      targetType: row.target_type || "unknown",
      path: row.path,
      feature: row.feature,
      targetHref: row.target_href,
      clicks: toNumber(row.clicks),
      uniqueVisitors: toNumber(row.unique_visitors),
    })),
    ips: ipRows.map((row) => ({
      ipAddress: row.ip_address || "unknown",
      pageViews: toNumber(row.page_views),
      clicks: toNumber(row.clicks),
      sessions: toNumber(row.sessions),
      uniqueVisitors: toNumber(row.unique_visitors),
      lastSeenAt: toIso(row.last_seen_at),
    })),
    recentEvents: recentRows.map((row) => ({
      eventType: row.eventType,
      feature: row.feature,
      path: row.path,
      targetLabel: row.targetLabel,
      targetType: row.targetType,
      ipAddress: row.ipAddress,
      durationSeconds: row.durationMs ? seconds(row.durationMs) : null,
      occurredAt: row.occurredAt.toISOString(),
    })),
  };
}
