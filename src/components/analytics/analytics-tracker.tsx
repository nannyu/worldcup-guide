"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { featureFromPath } from "@/lib/analytics/feature";

type ClientAnalyticsEvent = {
  eventId: string;
  type: "page_view" | "page_leave" | "click";
  path: string;
  feature: string;
  title?: string;
  visitorId: string;
  sessionId: string;
  occurredAt: string;
  durationMs?: number;
  targetType?: string;
  targetLabel?: string;
  href?: string;
  referrer?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type ActivePage = {
  path: string;
  feature: string;
  title: string;
  activeStartedAt?: number;
  accumulatedMs: number;
};

const visitorStorageKey = "wcg.analytics.visitor_id";
const sessionStorageKey = "wcg.analytics.session_id";

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${randomId}`;
}

function readOrCreateStorageValue(storage: Storage, key: string, prefix: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = createId(prefix);
  storage.setItem(key, created);
  return created;
}

function safeText(input: string | null | undefined, maxLength: number): string | undefined {
  const normalized = input?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function currentTitle(): string {
  return safeText(document.title, 512) || "世界杯装杯指南";
}

function sendAnalyticsEvents(events: ClientAnalyticsEvent[], useBeacon: boolean) {
  if (!events.length) return;
  const body = JSON.stringify({ events });

  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/events", blob);
    return;
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: body.length < 60_000,
  }).catch(() => undefined);
}

function findTrackableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest("[data-analytics-ignore='true']")) return null;
  return target.closest<HTMLElement>(
    "[data-analytics-label],a,button,[role='button'],input,select,textarea",
  );
}

function hrefForElement(element: HTMLElement): string | undefined {
  if (element instanceof HTMLAnchorElement) return safeText(element.href, 1024);
  const nestedAnchor = element.querySelector("a[href]");
  if (nestedAnchor instanceof HTMLAnchorElement) return safeText(nestedAnchor.href, 1024);
  return undefined;
}

function labelForElement(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement) {
    return safeText(
      element.getAttribute("data-analytics-label")
        || element.getAttribute("aria-label")
        || element.name
        || element.type,
      512,
    );
  }

  return safeText(
    element.getAttribute("data-analytics-label")
      || element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.textContent,
    512,
  );
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const queueRef = useRef<ClientAnalyticsEvent[]>([]);
  const flushTimerRef = useRef<number | undefined>(undefined);
  const visitorIdRef = useRef<string | undefined>(undefined);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const activePageRef = useRef<ActivePage | undefined>(undefined);

  const ensureIds = useCallback(() => {
    if (!visitorIdRef.current) {
      try {
        visitorIdRef.current = readOrCreateStorageValue(localStorage, visitorStorageKey, "visitor");
      } catch {
        visitorIdRef.current = createId("visitor");
      }
    }

    if (!sessionIdRef.current) {
      try {
        sessionIdRef.current = readOrCreateStorageValue(sessionStorage, sessionStorageKey, "session");
      } catch {
        sessionIdRef.current = createId("session");
      }
    }

    return {
      visitorId: visitorIdRef.current,
      sessionId: sessionIdRef.current,
    };
  }, []);

  const flush = useCallback((useBeacon = false) => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    const events = queueRef.current.splice(0);
    sendAnalyticsEvents(events, useBeacon);
  }, []);

  const enqueue = useCallback((event: Omit<ClientAnalyticsEvent, "eventId" | "visitorId" | "sessionId" | "occurredAt">, useBeacon = false) => {
    const ids = ensureIds();
    queueRef.current.push({
      ...event,
      eventId: createId("event"),
      visitorId: ids.visitorId,
      sessionId: ids.sessionId,
      occurredAt: new Date().toISOString(),
    });

    if (useBeacon) {
      flush(true);
      return;
    }

    if (!flushTimerRef.current) {
      flushTimerRef.current = window.setTimeout(() => flush(false), 800);
    }
  }, [ensureIds, flush]);

  const finishActivePage = useCallback((useBeacon = false) => {
    const activePage = activePageRef.current;
    if (!activePage) return;

    const now = Date.now();
    if (activePage.activeStartedAt) {
      activePage.accumulatedMs += now - activePage.activeStartedAt;
      activePage.activeStartedAt = undefined;
    }

    if (activePage.accumulatedMs > 0) {
      enqueue({
        type: "page_leave",
        path: activePage.path,
        feature: activePage.feature,
        title: activePage.title,
        durationMs: Math.round(activePage.accumulatedMs),
      }, useBeacon);
      activePage.accumulatedMs = 0;
    }
  }, [enqueue]);

  const startPage = useCallback((path: string) => {
    const feature = featureFromPath(path);
    const title = currentTitle();
    activePageRef.current = {
      path,
      feature,
      title,
      activeStartedAt: document.hidden ? undefined : Date.now(),
      accumulatedMs: 0,
    };
    enqueue({
      type: "page_view",
      path,
      feature,
      title,
      referrer: document.referrer || undefined,
    });
  }, [enqueue]);

  useEffect(() => {
    const path = pathname || "/";
    finishActivePage(false);
    startPage(path);
  }, [finishActivePage, pathname, startPage]);

  useEffect(() => {
    function handleVisibilityChange() {
      const activePage = activePageRef.current;
      if (!activePage) return;

      if (document.hidden) {
        finishActivePage(true);
        return;
      }

      activePage.title = currentTitle();
      activePage.activeStartedAt = Date.now();
    }

    function handlePageHide() {
      finishActivePage(true);
      flush(true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      finishActivePage(true);
      flush(true);
    };
  }, [finishActivePage, flush]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const element = findTrackableElement(event.target);
      if (!element) return;

      const label = labelForElement(element);
      const href = hrefForElement(element);
      if (!label && !href) return;

      const path = pathname || "/";
      const feature = safeText(
        element.closest<HTMLElement>("[data-analytics-feature]")?.getAttribute("data-analytics-feature"),
        128,
      ) || featureFromPath(path);
      const role = safeText(element.getAttribute("role"), 64);
      const targetType = safeText(
        element.getAttribute("data-analytics-type")
          || role
          || element.tagName.toLowerCase(),
        64,
      ) || "unknown";

      enqueue({
        type: "click",
        path,
        feature,
        title: currentTitle(),
        targetType,
        targetLabel: label || href,
        href,
      });
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [enqueue, pathname]);

  return null;
}
