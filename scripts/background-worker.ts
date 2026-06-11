import { config } from "dotenv";
import { processNextBackgroundJob } from "@/lib/background/tasks";
import { closeDatabase } from "@/lib/db/client";

config({ path: ".env" });

const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
const idleMs = Number(process.env.WORKER_IDLE_MS || 5000);
const busyMs = Number(process.env.WORKER_BUSY_MS || 250);
let stopping = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[worker] started ${workerId}`);
  while (!stopping) {
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
