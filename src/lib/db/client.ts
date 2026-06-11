import { config } from "dotenv";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

config({ path: ".env" });

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
  return {
    connect_timeout: 3,
    idle_timeout: 20,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    prepare: process.env.DATABASE_PREPARE === "true",
    ssl: process.env.DATABASE_SSL === "disable" ? false : process.env.DATABASE_SSL === "require" ? "require" : undefined,
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
