// Database diagnostic to check basic connectivity
import { rawDb } from "../database/db.ts";

export async function dbDiagnostic() {
  console.log("🔍 Running database diagnostic...");

  try {
    // First test basic connectivity
    console.log("Testing raw database connection...");
    const tables = await rawDb.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      args: [],
    });
    console.log(
      "Database tables found:",
      tables.rows?.map((row) => row[0]) || [],
    );

    // Test if anchor_users table exists specifically
    const anchorUsersExists = tables.rows?.some((row) =>
      row[0] === "anchor_users"
    );
    console.log("anchor_users table exists:", anchorUsersExists);

    if (anchorUsersExists) {
      // Try a simple count query directly on SQLite
      console.log("Testing direct count query...");
      const countResult = await rawDb.execute({
        sql: "SELECT COUNT(*) as count FROM anchor_users",
        args: [],
      });
      console.log("Raw count result:", countResult.rows);

      // Check table structure
      console.log("Checking anchor_users table structure...");
      const tableInfo = await rawDb.execute({
        sql: "PRAGMA table_info(anchor_users)",
        args: [],
      });
      console.log("Table structure:", tableInfo.rows);

      // Try the failing query directly
      console.log("Testing the query that was failing...");
      try {
        const testResult = await rawDb.execute({
          sql:
            'SELECT "did", "handle", "pds", "added_at" FROM "anchor_users" ORDER BY "anchor_users"."added_at" DESC LIMIT 5',
          args: [],
        });
        console.log("Direct query result:", testResult.rows);
      } catch (queryError) {
        console.log("Direct query failed:", queryError.message);
      }

      // Test the PDS crawler query that's now failing
      console.log("Testing PDS crawler query...");
      try {
        const pdsTestResult = await rawDb.execute({
          sql:
            'SELECT "did", "handle", "pds", "added_at", "last_checkin_crawl" FROM "anchor_users" LIMIT 3',
          args: [],
        });
        console.log("PDS crawler query result:", pdsTestResult.rows);
      } catch (pdsQueryError) {
        console.log("PDS crawler query failed:", pdsQueryError.message);
      }
    }

    let tableStructure = null;
    let directQueryResult = null;
    let pdsQueryResult = null;

    if (anchorUsersExists) {
      // Get table structure
      try {
        const tableInfo = await rawDb.execute({
          sql: "PRAGMA table_info(anchor_users)",
          args: [],
        });
        tableStructure = tableInfo.rows;
      } catch (error) {
        tableStructure = `Error getting table structure: ${error.message}`;
      }

      // Test direct query
      try {
        const testResult = await rawDb.execute({
          sql: 'SELECT COUNT(*) as count FROM "anchor_users"',
          args: [],
        });
        directQueryResult = testResult.rows;
      } catch (error) {
        directQueryResult = `Error in direct query: ${error.message}`;
      }

      // Test PDS crawler query
      try {
        const pdsTestResult = await rawDb.execute({
          sql: 'SELECT "did", "handle", "pds" FROM "anchor_users" LIMIT 3',
          args: [],
        });
        pdsQueryResult = pdsTestResult.rows;
      } catch (error) {
        pdsQueryResult = `Error in PDS query: ${error.message}`;
      }
    }

    return {
      success: true,
      tables: tables.rows?.map((row) => row[0]) || [],
      anchorUsersExists,
      tableStructure,
      directQueryResult,
      pdsQueryResult,
    };
  } catch (error) {
    console.error("❌ Database diagnostic failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default dbDiagnostic;
