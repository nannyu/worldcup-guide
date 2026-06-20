import { config } from "dotenv";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import dns from "node:dns";
import postgres, { type Sql } from "postgres";

if (process.env.NODE_ENV !== "production") {
  config({ path: ".env" });
}

dns.setDefaultResultOrder("ipv4first");

type DbClient = {
  sql: Sql;
  db: PostgresJsDatabase;
};

let client: DbClient | undefined;

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }
  return "postgresql://postgres:postgres@localhost:5432/myapp";
}

function postgresOptions(): postgres.Options<Record<string, postgres.PostgresType>> {
  const configuredPoolMax = Number(process.env.DATABASE_POOL_MAX);
  const defaultPoolMax = process.env.VERCEL ? 1 : 5;
  return {
    connect_timeout: 3,
    idle_timeout: 20,
    max: Number.isInteger(configuredPoolMax) && configuredPoolMax > 0
      ? configuredPoolMax
      : defaultPoolMax,
    prepare: process.env.DATABASE_PREPARE === "true",
    ssl: process.env.DATABASE_SSL === "disable"
      ? false
      : process.env.NODE_ENV === "production"
        ? "require"
        : process.env.DATABASE_SSL === "require"
          ? "require"
          : undefined,
  };
}

function getClient(): DbClient {
  client ||= (() => {
    const sql = postgres(databaseUrl(), postgresOptions());
    return { sql, db: drizzle(sql) };
  })();
  return client;
}

export function getDb(): PostgresJsDatabase {
  return getClient().db;
}

export function getSql(): Sql {
  return getClient().sql;
}

export async function closeDatabase() {
  if (!client) return;
  const sql = client.sql;
  client = undefined;
  await sql.end();
}
