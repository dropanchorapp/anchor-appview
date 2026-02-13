// Database module using Turso/libSQL
// Works on Deno Deploy (web client) and local development (native client)

import { drizzle } from "https://esm.sh/drizzle-orm@0.44.5/sqlite-proxy";
import * as schema from "./schema.ts";

const dbUrl = Deno.env.get("TURSO_DATABASE_URL") || "file:.local/anchor.db";
const isLocal = dbUrl.startsWith("file:");

// Use native client for local file: URLs, web client for remote Turso/Deploy
const { createClient } = isLocal
  ? await import("@libsql/client")
  : await import("@libsql/client/web");

const client = createClient({
  url: dbUrl,
  authToken: Deno.env.get("TURSO_AUTH_TOKEN"),
});

// Wrap the client to provide a consistent interface
// The libSQL client returns Row objects, we convert to arrays for compatibility
export const rawDb = {
  execute: async (
    query: { sql: string; args: unknown[] },
  ): Promise<{ rows: unknown[][] }> => {
    const result = await client.execute({
      sql: query.sql,
      args: query.args as any,
    });
    const rows = result.rows.map((row) => Object.values(row));
    return { rows };
  },
};

// Create Drizzle database instance with schema using sqlite-proxy adapter
export const db = drizzle(
  async (sql, params) => {
    const result = await rawDb.execute({ sql, args: params || [] });
    return { rows: result.rows };
  },
  { schema },
);

// Initialize all tables using Drizzle migrations
export async function initializeTables() {
  const { runMigrations } = await import("./migrations.ts");
  await runMigrations();
}

// Test the database connection
export async function testDatabase() {
  try {
    await initializeTables();
    const result = await rawDb.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table'",
      args: [],
    });
    console.log("Database tables:", result.rows);
    return true;
  } catch (error) {
    console.error("Database test failed:", error);
    return false;
  }
}

console.log(`✅ Using ${isLocal ? "local" : "Turso"} database`);
