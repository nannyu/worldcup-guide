import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { featureFromPath, normalizeAnalyticsPath } from "@/lib/analytics/feature";

export type AnalyticsEventType = "page_view" | "page_leave" | "click";

export type AnalyticsEventInput = {
  id: string;
  eventType: AnalyticsEventType;
  feature: string;
  path: string;
  title?: string | null;
  visitorId: string;
  sessionId: string;
  visitorKey: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  targetType?: string | null;
  targetLabel?: string | null;
  targetHref?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: Date;
};

const eventTypes = new Set<AnalyticsEventType>(["page_view", "page_leave", "click"]);

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function metadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => {
        const valueType = typeof entryValue;
        return entryValue === null || ["string", "number", "boolean"].includes(valueType);
      })
      .slice(0, 16),
  );
}

function eventTime(value: unknown): Date {
  const parsed = typeof value === "string" ? new Date(value) : undefined;
  const now = new Date();
  if (!parsed || !Number.isFinite(parsed.getTime())) return now;
  const maxFuture = now.getTime() + 5 * 60 * 1000;
  const minPast = now.getTime() - 32 * 24 * 60 * 60 * 1000;
  if (parsed.getTime() > maxFuture || parsed.getTime() < minPast) return now;
  return parsed;
}

function duration(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.round(value)));
}

export function clientIpFromRequest(request: NextRequest): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    text(request.headers.get("cf-connecting-ip"), 64)
    || text(request.headers.get("x-real-ip"), 64)
    || text(forwardedFor, 64)
    || undefined
  );
}

function visitorKeyFor(input: { ipAddress?: string; userAgent?: string; visitorId: string }): string {
  return createHash("sha256")
    .update([input.ipAddress || "unknown-ip", input.userAgent || "unknown-ua", input.visitorId].join("|"))
    .digest("hex");
}

export function parseAnalyticsEvents(body: unknown, request: NextRequest): AnalyticsEventInput[] {
  const rawEvents = Array.isArray((body as { events?: unknown } | null)?.events)
    ? (body as { events: unknown[] }).events
    : Array.isArray(body)
      ? body
      : [];
  const ipAddress = clientIpFromRequest(request);
  const userAgent = text(request.headers.get("user-agent"), 2000);
  const requestReferrer = text(request.headers.get("referer"), 2000);

  return rawEvents.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const eventType = text(record.type || record.eventType, 32) as AnalyticsEventType | undefined;
    if (!eventType || !eventTypes.has(eventType)) return [];

    const path = normalizeAnalyticsPath(text(record.path, 512) || requestReferrer || "/");
    const visitorId = text(record.visitorId, 128) || `anonymous:${randomUUID()}`;
    const sessionId = text(record.sessionId, 128) || `session:${randomUUID()}`;
    const targetHref = text(record.href || record.targetHref, 1024);
    const eventMetadata = metadata(record.metadata);
    const feature = text(record.feature, 128) || text(eventMetadata?.feature, 128) || featureFromPath(path);

    return [{
      id: text(record.eventId || record.id, 128) || randomUUID(),
      eventType,
      feature,
      path,
      title: text(record.title, 512) || null,
      visitorId,
      sessionId,
      visitorKey: visitorKeyFor({ ipAddress, userAgent, visitorId }),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      referrer: text(record.referrer, 2000) || requestReferrer || null,
      targetType: text(record.targetType, 64) || null,
      targetLabel: text(record.targetLabel || record.label, 512) || null,
      targetHref: targetHref || null,
      durationMs: duration(record.durationMs) || null,
      metadata: eventMetadata || null,
      occurredAt: eventTime(record.occurredAt),
    }];
  });
}
