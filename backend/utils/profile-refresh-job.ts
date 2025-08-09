// @val-town profileRefreshJob
// Cron job: Runs every hour to refresh stale profile data
import { ATProtocolProfileResolver } from "./profile-resolver.ts";
import { SqliteStorageProvider } from "./storage-provider.ts";

export default async function () {
  console.log("Starting profile refresh job...");

  try {
    // Initialize profile resolver with database connection
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");
    const storage = new SqliteStorageProvider(sqlite);
    const resolver = new ATProtocolProfileResolver(storage);

    // Refresh up to 100 stale profiles per run
    const refreshedCount = await resolver.refreshStaleProfiles(100);

    console.log(
      `Profile refresh job completed: ${refreshedCount} profiles updated`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        profiles_refreshed: refreshedCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Profile refresh job failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
