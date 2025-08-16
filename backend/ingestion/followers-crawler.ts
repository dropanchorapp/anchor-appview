// Followers Crawler - Dedicated crawling for following relationships
// Runs less frequently than checkin crawler since follows change less often
import { initializeTables } from "../database/db.ts";
import {
  type AnchorUser,
  getRegisteredUsers,
  getUserStats,
  initializeUserTables,
  updateUserLastFollowerCrawl,
} from "../database/user-tracking.ts";
import { syncUserFollows } from "./followers-processor.ts";

interface FollowsResponse {
  follows: Array<{
    did: string;
    handle?: string;
    displayName?: string;
    createdAt: string;
  }>;
  cursor?: string;
}

export default async function followersCrawler(): Promise<Response> {
  const startTime = Date.now();
  let totalFollowsProcessed = 0;
  let totalErrors = 0;
  let usersProcessed = 0;

  console.log("👥 Starting followers crawler session...");

  try {
    // Initialize database tables
    await initializeTables();
    initializeUserTables();

    // Get registered users to crawl
    const users = await getRegisteredUsers();
    console.log(
      `📊 Found ${users.length} registered users to crawl follows for`,
    );

    if (users.length === 0) {
      console.log("No registered users found, followers crawler completed");
      return createResponse(0, 0, 0, Date.now() - startTime);
    }

    // Process users sequentially to avoid overwhelming PDS servers
    for (const user of users) {
      try {
        console.log(`👥 Crawling follows for ${user.handle} on ${user.pdsUrl}`);
        const syncResult = await crawlUserFollows(user);
        totalFollowsProcessed += syncResult.totalFollows;
        usersProcessed++;

        // Brief pause between users to be respectful to PDS servers
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        totalErrors++;
        console.error(
          `❌ Error crawling follows for ${user.handle}:`,
          error,
        );
      }
    }

    // Log final statistics
    const stats = await getUserStats();
    const duration = Date.now() - startTime;

    console.log("=== Followers Crawler Session Summary ===");
    console.log(`Total registered users: ${stats.totalUsers}`);
    console.log(`Users processed: ${usersProcessed}/${users.length}`);
    console.log(`Total follows processed: ${totalFollowsProcessed}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Session duration: ${duration}ms`);
    console.log("=== End Summary ===");

    return createResponse(
      totalFollowsProcessed,
      totalErrors,
      usersProcessed,
      duration,
    );
  } catch (error) {
    console.error("❌ Followers crawler session failed:", error);
    totalErrors++;

    const duration = Date.now() - startTime;
    return createResponse(
      totalFollowsProcessed,
      totalErrors,
      usersProcessed,
      duration,
    );
  }
}

async function crawlUserFollows(
  user: AnchorUser,
): Promise<
  { totalFollows: number; followsAdded: number; followsRemoved: number }
> {
  const allFollows: Array<{ did: string; createdAt: string }> = [];
  let cursor: string | undefined;
  let pageCount = 0;

  try {
    // Paginate through all follows
    do {
      pageCount++;
      console.log(`📄 Page ${pageCount} for ${user.handle}`);

      // Build URL with pagination cursor
      // Use the public bsky.social API since getFollows may not be available on all PDS instances
      let url = `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows` +
        `?actor=${user.did}&limit=100`;
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Anchor-Followers-Crawler/1.0",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👥 No follows found for ${user.handle} (404)`);
          break;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: FollowsResponse = await response.json();

      if (!data.follows || data.follows.length === 0) {
        console.log(`👥 No more follows found for ${user.handle}`);
        break;
      }

      // Add follows from this page
      for (const follow of data.follows) {
        allFollows.push({
          did: follow.did,
          createdAt: follow.createdAt,
        });
      }

      console.log(
        `📄 Page ${pageCount}: Found ${data.follows.length} follows for ${user.handle} (total: ${allFollows.length})`,
      );

      // Set cursor for next page
      cursor = data.cursor;

      // Rate limiting - pause between pages
      if (cursor) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } while (cursor && pageCount < 200); // Safety limit: max 200 pages (20k follows)

    console.log(
      `📊 Total follows discovered for ${user.handle}: ${allFollows.length}`,
    );

    // Sync follows to database using incremental sync
    const syncResult = await syncUserFollows(user.did, allFollows);

    // Update last crawled timestamp
    await updateUserLastFollowerCrawl(user.did);

    console.log(
      `✅ Successfully synced follows for ${user.handle}: +${syncResult.followsAdded} -${syncResult.followsRemoved} (total: ${allFollows.length})`,
    );

    return {
      totalFollows: allFollows.length,
      followsAdded: syncResult.followsAdded,
      followsRemoved: syncResult.followsRemoved,
    };
  } catch (error) {
    console.error(
      `❌ Error crawling follows for ${user.handle} on ${user.pdsUrl}:`,
      error,
    );
    throw error;
  }
}

function createResponse(
  followsProcessed: number,
  errors: number,
  usersProcessed: number,
  duration: number,
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      type: "followers-crawler",
      follows_processed: followsProcessed,
      users_processed: usersProcessed,
      errors,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
