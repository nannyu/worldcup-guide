import { config } from "dotenv";
import { runDataRefresh } from "@/lib/data-sources/refresh-runner";
import { closeDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { seedFifaSchedule } from "@/lib/db/seed-fifa-schedule";

config({ path: ".env" });

const mode = process.argv.includes("--init") ? "initialize" : "scheduled";

async function main() {
  if (mode === "initialize" && isDatabaseConfigured) {
    await seedFifaSchedule();
  }

  const result = await runDataRefresh(mode);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
