// @val-town userMigrationEndpoint
// Val Town endpoint to run user migration and diagnostic scripts
// Usage:
//   GET /user-migration-endpoint?action=check - Check existing user data
//   GET /user-migration-endpoint?action=migrate - Migrate users to tracking system

import checkExistingUsers from "./check-existing-users.ts";
import migrateUsersToTracking from "./migrate-users-to-tracking.ts";

export default async function userMigrationEndpoint(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "check";

  console.log(`🔧 User migration endpoint called with action: ${action}`);

  try {
    if (action === "check") {
      // Run diagnostic check
      console.log("📊 Running existing user data check...");
      await checkExistingUsers();

      return new Response(
        JSON.stringify({
          success: true,
          action: "check",
          message:
            "User data check completed successfully. See logs for details.",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } else if (action === "migrate") {
      // Run migration
      console.log("🔄 Running user migration...");
      await migrateUsersToTracking();

      return new Response(
        JSON.stringify({
          success: true,
          action: "migrate",
          message:
            "User migration completed successfully. See logs for details.",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid action. Use ?action=check or ?action=migrate",
          validActions: ["check", "migrate"],
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error(`❌ Error in ${action} operation:`, error);

    return new Response(
      JSON.stringify({
        success: false,
        action,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
