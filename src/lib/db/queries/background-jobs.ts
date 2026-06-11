import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb, getSql, isDatabaseConfigured } from "@/lib/db/client";
import { backgroundJobs, type BackgroundJob } from "@/lib/db/schema/data-cache";

export type BackgroundJobType =
  | "teams.refresh"
  | "odds.refresh"
  | "radar.refresh"
  | "matches.refresh"
  | "morning.refresh"
  | "news.refresh"
  | "news.translate"
  | "refresh.full";

export type BackgroundJobStatus = "queued" | "running" | "succeeded" | "failed";

export type EnqueueBackgroundJobInput = {
  id?: string;
  type: BackgroundJobType;
  payload?: Record<string, unknown>;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
};

export function requireJobDatabase() {
  if (!isDatabaseConfigured) {
    throw new Error("DATABASE_URL is required for persistent background jobs.");
  }
}

function localNoopJob(input: EnqueueBackgroundJobInput, id: string): BackgroundJob {
  const now = new Date();
  return {
    id,
    type: input.type,
    status: "queued",
    payload: input.payload || {},
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    priority: input.priority ?? 100,
    runAfter: input.runAfter || now,
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
    errorMessage: "DATABASE_URL is not configured; persistent background job was not stored.",
    createdAt: now,
    updatedAt: now,
  };
}

export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput): Promise<BackgroundJob> {
  const id = input.id || `${input.type}:${randomUUID()}`;
  if (!isDatabaseConfigured) {
    if (process.env.NODE_ENV === "production") requireJobDatabase();
    return localNoopJob(input, id);
  }
  const now = new Date();
  const runAfter = input.runAfter || now;
  const nowIso = now.toISOString();
  const runAfterIso = runAfter.toISOString();
  const payload = input.payload || {};
  const priority = input.priority ?? 100;
  const maxAttempts = input.maxAttempts ?? 3;
  const sql = getSql();
  const rows = await sql<BackgroundJob[]>`
    insert into background_jobs (
      id, type, status, payload, attempts, max_attempts, priority, run_after, locked_at,
      locked_by, started_at, finished_at, error_message, updated_at
    )
    values (
      ${id}, ${input.type}, 'queued', ${sql.json(payload as never)}, 0, ${maxAttempts}, ${priority}, ${runAfterIso}::timestamp,
      null, null, null, null, null, ${nowIso}::timestamp
    )
    on conflict (id) do update set
      type = excluded.type,
      payload = excluded.payload,
      priority = excluded.priority,
      run_after = excluded.run_after,
      max_attempts = excluded.max_attempts,
      status = case
        when background_jobs.status in ('succeeded', 'failed') then 'queued'
        else background_jobs.status
      end,
      attempts = case
        when background_jobs.status in ('succeeded', 'failed') then 0
        else background_jobs.attempts
      end,
      locked_at = case
        when background_jobs.status in ('succeeded', 'failed') then null
        else background_jobs.locked_at
      end,
      locked_by = case
        when background_jobs.status in ('succeeded', 'failed') then null
        else background_jobs.locked_by
      end,
      started_at = case
        when background_jobs.status in ('succeeded', 'failed') then null
        else background_jobs.started_at
      end,
      finished_at = case
        when background_jobs.status in ('succeeded', 'failed') then null
        else background_jobs.finished_at
      end,
      error_message = case
        when background_jobs.status in ('succeeded', 'failed') then null
        else background_jobs.error_message
      end,
      updated_at = excluded.updated_at
    returning *
  `;
  return rows[0];
}

export async function claimNextBackgroundJob(workerId: string, lockTimeoutSeconds = 300): Promise<BackgroundJob | undefined> {
  requireJobDatabase();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - lockTimeoutSeconds * 1000);
  const nowIso = now.toISOString();
  const staleBeforeIso = staleBefore.toISOString();
  const sql = getSql();
  const rows = await sql<BackgroundJob[]>`
    update background_jobs
    set
      status = 'running',
      attempts = attempts + 1,
      locked_at = ${nowIso}::timestamp,
      locked_by = ${workerId},
      started_at = coalesce(started_at, ${nowIso}::timestamp),
      updated_at = ${nowIso}::timestamp
    where id = (
      select id
      from background_jobs
      where
        (status = 'queued' and run_after <= ${nowIso}::timestamp)
        or (status = 'running' and locked_at < ${staleBeforeIso}::timestamp)
      order by priority asc, run_after asc, created_at asc
      for update skip locked
      limit 1
    )
    returning *
  `;
  return rows[0];
}

export async function completeBackgroundJob(id: string): Promise<void> {
  await getDb()
    .update(backgroundJobs)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, id));
}

export async function failBackgroundJob(job: BackgroundJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "unknown error";
  const shouldRetry = job.attempts < job.maxAttempts;
  const nextRun = new Date(Date.now() + Math.min(15 * 60_000, 30_000 * Math.max(1, job.attempts)));
  await getDb()
    .update(backgroundJobs)
    .set({
      status: shouldRetry ? "queued" : "failed",
      runAfter: shouldRetry ? nextRun : job.runAfter,
      finishedAt: shouldRetry ? null : new Date(),
      lockedAt: null,
      lockedBy: null,
      errorMessage: message.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, job.id));
}

export async function listBackgroundJobs(limit = 20): Promise<BackgroundJob[]> {
  if (!isDatabaseConfigured) {
    if (process.env.NODE_ENV === "production") requireJobDatabase();
    return [];
  }
  return getDb()
    .select()
    .from(backgroundJobs)
    .orderBy(asc(backgroundJobs.status), asc(backgroundJobs.runAfter))
    .limit(limit);
}
