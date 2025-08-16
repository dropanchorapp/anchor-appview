// Drizzle ORM database module using Val Town's sqlite
import { drizzle } from "https://esm.sh/drizzle-orm/libsql";
import { sqlite } from "https://esm.town/v/std/sqlite2";
import * as schema from "./schema.ts";

// Create Drizzle database instance with schema
// Note: Using any to bypass type compatibility issue between esm.town sqlite and drizzle-orm/libsql
export const db = drizzle(sqlite as any, { schema });

// Export raw sqlite for migrations and schema operations
export const rawDb = sqlite;

// Initialize all tables using Drizzle migrations
export async function initializeTables() {
  // Run proper Drizzle-based migrations
  const { runMigrations } = await import("./migrations.ts");
  await runMigrations();

  // Initialize user tracking tables for PDS crawler
  const { initializeUserTables } = await import("./user-tracking.ts");
  initializeUserTables();
}

// Test the database connection
export async function testDatabase() {
  try {
    await initializeTables();
    const result = await rawDb.execute(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    console.log("Database tables:", result.rows);
    return true;
  } catch (error) {
    console.error("Database test failed:", error);
    return false;
  }
}
