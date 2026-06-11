import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import postgres from "postgres";

config({ path: ".env" });

const runMigrate = async () => {
  const databaseUrl = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required to run migrations.");
  const client = postgres(
    databaseUrl,
    {
      max: 1,
      prepare: false,
      ssl: process.env.DATABASE_SSL === "disable" ? false : process.env.DATABASE_SSL === "require" ? "require" : undefined,
    }
  );
  const db = drizzle(client);

  console.log("⏳ Running migrations...");

  const start = Date.now();
  const migrationsFolder = path.join(process.cwd(), "src/lib/db/migrations");
  await migrate(db, { migrationsFolder });
  const end = Date.now();

  console.log("✅ Migrations completed in", end - start, "ms");
  await client.end();
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
