// Script to manually run database migrations
import { runMigrations } from "../database/migrations.ts";
import { initializeTables } from "../database/db.ts";

export async function runMigrationsManually() {
  console.log("🔧 Running database migrations manually...");

  try {
    // Initialize user tracking tables first
    await initializeTables();

    // Then run migrations
    await runMigrations();

    console.log("✅ All migrations completed successfully");

    return {
      success: true,
      message: "Database migrations completed successfully",
      applied: 0, // Migrations don't return count in this system
      migrations: [],
    };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default runMigrationsManually;
