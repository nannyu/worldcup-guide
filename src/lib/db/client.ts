import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env" });

const client = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/myapp",
  {
    connect_timeout: 3,
    idle_timeout: 20,
    max: 5,
  },
);

export const db = drizzle(client);

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

export async function closeDatabase() {
  await client.end();
}
