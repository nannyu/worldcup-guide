import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const client = postgres(databaseUrl, { ssl: "require" });
  const db = drizzle(client);
  
  try {
    const results = await db.execute(sql`
      SELECT feature, count(*), max(updated_at) as last_updated FROM data_snapshots GROUP BY feature
    `);
    console.log("Latest snapshot updates in database:");
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error("Failed to query database:", error);
  } finally {
    await client.end();
  }
}

main();
