// Unified cron script for all Anchor crawlers
// Can be scheduled with different intervals for different crawler types

import pdsCrawler from "../backend/ingestion/pds-crawler.ts";
import followersCrawler from "../backend/ingestion/followers-crawler.ts";

interface CrawlerResult {
  success: boolean;
  type: string;
  duration_ms: number;
  records_processed?: number;
  follows_processed?: number;
  users_processed: number;
  errors: number;
  timestamp: string;
}

// Main function that can be called with different crawler types
export async function runCrawler(
  type: "checkins" | "followers",
): Promise<Response> {
  console.log(`🚀 Starting ${type} crawler session...`);
  const startTime = Date.now();
  const results: CrawlerResult[] = [];

  try {
    switch (type) {
      case "checkins": {
        console.log("📍 Running checkins (PDS) crawler...");
        const checkinResult = await pdsCrawler();
        const checkinData = await checkinResult.json() as CrawlerResult;
        results.push(checkinData);
        break;
      }

      case "followers": {
        console.log("👥 Running followers crawler...");
        const followersResult = await followersCrawler();
        const followersData = await followersResult.json() as CrawlerResult;
        results.push(followersData);
        break;
      }

      default:
        throw new Error(`Unknown crawler type: ${type}`);
    }

    const totalDuration = Date.now() - startTime;
    const totalUsers = results.reduce((sum, r) => sum + r.users_processed, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
    const allSuccess = results.every((r) => r.success);

    console.log(`=== Crawler Session Complete ===`);
    console.log(`Type: ${type}`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log(`Total users processed: ${totalUsers}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Overall success: ${allSuccess}`);
    console.log(`=== End Summary ===`);

    return new Response(
      JSON.stringify(
        {
          success: allSuccess,
          type: `cron-${type}`,
          results: results,
          summary: {
            total_duration_ms: totalDuration,
            total_users_processed: totalUsers,
            total_errors: totalErrors,
            crawlers_run: results.length,
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error(`❌ Crawler session failed:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        type: `cron-${type}`,
        error: error.message,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Specific cron functions for different schedules
export async function cronCheckins(): Promise<Response> {
  return await runCrawler("checkins");
}

export async function cronFollowers(): Promise<Response> {
  return await runCrawler("followers");
}

// Default export for direct execution
export default async function (): Promise<Response> {
  // Default to checkins only for frequent cron jobs
  return await cronCheckins();
}

// CLI usage when run directly
if (import.meta.main) {
  const crawlerType = Deno.args[0] as "checkins" | "followers" ||
    "checkins";
  console.log(`Running ${crawlerType} crawler from CLI...`);
  const response = await runCrawler(crawlerType);
  const result = await response.text();
  console.log(result);
}
