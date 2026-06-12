import { config } from "dotenv";
import { enqueueDueRefreshJobs } from "@/lib/background/scheduler";
import { processNextBackgroundJob } from "@/lib/background/tasks";
import { closeDatabase } from "@/lib/db/client";

config({ path: ".env" });

const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
const idleMs = Math.max(250, Number(process.env.WORKER_IDLE_MS) || 5000);
const busyMs = Math.max(50, Number(process.env.WORKER_BUSY_MS) || 250);
const schedulerMs = Math.max(1000, Number(process.env.WORKER_SCHEDULER_INTERVAL_MS) || 30_000);
const schedulerEnabled = process.env.WORKER_SCHEDULER_DISABLED !== "1";
let stopping = false;
let nextSchedulerAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[worker] started ${workerId}`);
  while (!stopping) {
    if (schedulerEnabled && Date.now() >= nextSchedulerAt) {
      nextSchedulerAt = Date.now() + schedulerMs;
      try {
        const scheduler = await enqueueDueRefreshJobs();
        if (scheduler.enqueued.length || scheduler.errors.length) {
          console.log(
            `[worker] scheduler mode=${scheduler.activityMode} enqueued=${scheduler.enqueued.join(",") || "-"} errors=${scheduler.errors.length}`,
          );
        }
      } catch (error) {
        console.error("[worker] scheduler failed:", error instanceof Error ? error.message : error);
      }
    }
    const processed = await processNextBackgroundJob(workerId);
    await sleep(processed ? busyMs : idleMs);
  }
}

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

main()
  .catch((error) => {
    console.error("[worker] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
    console.log(`[worker] stopped ${workerId}`);
  });
