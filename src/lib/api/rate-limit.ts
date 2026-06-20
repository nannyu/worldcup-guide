import { type NextRequest, NextResponse } from "next/server";

// In-memory per-IP rate limiter. Good enough for single-process deployments.
// For distributed setups, swap with Redis-backed implementation.

const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_HITS = 60; // 60 requests per minute per IP

// Periodic cleanup to prevent memory growth
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  const cutoff = now - WINDOW_MS;
  for (const [ip, timestamps] of hits) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) hits.delete(ip);
    else hits.set(ip, valid);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(request: NextRequest): NextResponse | null {
  cleanup();
  const ip = getClientIp(request);
  const now = Date.now();
  const timestamps = hits.get(ip) || [];
  const valid = timestamps.filter((t) => t > now - WINDOW_MS);

  if (valid.length >= MAX_HITS) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(MAX_HITS),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  valid.push(now);
  hits.set(ip, valid);
  return null;
}
