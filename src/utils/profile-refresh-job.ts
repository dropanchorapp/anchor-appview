// @val-town profileRefreshJob
// Cron job: Runs every hour to refresh stale profile data
import { refreshStaleProfiles } from "./profile-resolver.ts";

export default async function () {
  console.log("Starting profile refresh job...");

  try {
    // Refresh up to 100 stale profiles per run
    const refreshedCount = await refreshStaleProfiles(100);

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
