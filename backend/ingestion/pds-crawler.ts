// PDS Crawler - Direct PDS querying for registered Anchor users
// Replaces Jetstream poller with privacy-focused approach
import { initializeTables } from "../database/db.ts";
import {
  type AnchorUser,
  getRegisteredUsers,
  getUserStats,
  initializeUserTables,
  updateUserLastCrawled,
} from "../database/user-tracking.ts";
import { processCheckinEvent } from "./record-processor.ts";

interface CheckinRecord {
  uri: string;
  cid: string;
  value: {
    $type: string;
    text: string;
    createdAt: string;
    addressRef: {
      uri: string;
      cid: string;
    };
    coordinates: {
      latitude: number;
      longitude: number;
    };
    category?: string;
    categoryGroup?: string;
    categoryIcon?: string;
  };
}

interface PdsListRecordsResponse {
  records: CheckinRecord[];
  cursor?: string;
}

export default async function pdsCrawler(): Promise<Response> {
  const startTime = Date.now();
  let totalRecordsProcessed = 0;
  let totalErrors = 0;
  let usersProcessed = 0;

  console.log("🕸️ Starting PDS crawler session...");

  try {
    // Initialize database tables
    await initializeTables();
    initializeUserTables();

    // Get registered users to crawl
    const users = await getRegisteredUsers();
    console.log(`📊 Found ${users.length} registered users to crawl`);

    if (users.length === 0) {
      console.log("No registered users found, crawler completed");
      return createResponse(0, 0, 0, Date.now() - startTime);
    }

    // Process users in batches to avoid overwhelming PDSs
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${
          Math.ceil(users.length / batchSize)
        } (${batch.length} users)`,
      );

      // Process batch in parallel
      const batchPromises = batch.map((user) => crawlUserCheckins(user));
      const batchResults = await Promise.allSettled(batchPromises);

      // Count results
      batchResults.forEach((result, index) => {
        usersProcessed++;
        if (result.status === "fulfilled") {
          totalRecordsProcessed += result.value;
        } else {
          totalErrors++;
          console.error(
            `❌ Error crawling user ${batch[index].handle}:`,
            result.reason,
          );
        }
      });

      // Brief pause between batches to be respectful
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Log final statistics
    const stats = await getUserStats();
    const duration = Date.now() - startTime;

    console.log("=== PDS Crawler Session Summary ===");
    console.log(`Total registered users: ${stats.totalUsers}`);
    console.log(`Monitored PDS servers: ${stats.totalPDSes}`);
    console.log(`Users processed: ${usersProcessed}/${users.length}`);
    console.log(`Records processed: ${totalRecordsProcessed}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Session duration: ${duration}ms`);
    console.log("=== End Summary ===");

    return createResponse(
      totalRecordsProcessed,
      totalErrors,
      usersProcessed,
      duration,
    );
  } catch (error) {
    console.error("❌ PDS crawler session failed:", error);
    totalErrors++;

    const duration = Date.now() - startTime;
    return createResponse(
      totalRecordsProcessed,
      totalErrors,
      usersProcessed,
      duration,
    );
  }
}

async function crawlUserCheckins(user: AnchorUser): Promise<number> {
  console.log(`🔍 Crawling checkins for ${user.handle} on ${user.pdsUrl}`);

  try {
    // Query user's PDS for checkin records
    const url = `${user.pdsUrl}/xrpc/com.atproto.repo.listRecords` +
      `?repo=${user.did}&collection=app.dropanchor.checkin&limit=100`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Anchor-PDS-Crawler/1.0",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`📭 No checkins found for ${user.handle} (404)`);
        await updateUserLastCrawled(user.did);
        return 0;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: PdsListRecordsResponse = await response.json();

    if (!data.records || data.records.length === 0) {
      console.log(`📭 No checkins found for ${user.handle}`);
      await updateUserLastCrawled(user.did);
      return 0;
    }

    console.log(`📍 Found ${data.records.length} checkins for ${user.handle}`);

    // Process each checkin record
    let processedCount = 0;
    for (const record of data.records) {
      try {
        // Convert to event format expected by existing processor
        const event = {
          did: user.did,
          time_us: Date.now() * 1000, // Convert to microseconds
          commit: {
            rkey: extractRkeyFromUri(record.uri),
            collection: "app.dropanchor.checkin",
            operation: "create" as const,
            record: record.value,
            cid: record.cid,
          },
        };

        await processCheckinEvent(event);
        processedCount++;
      } catch (error) {
        console.error(`❌ Error processing record ${record.uri}:`, error);
      }
    }

    // Update user's last crawled timestamp
    await updateUserLastCrawled(user.did);

    console.log(
      `✅ Successfully processed ${processedCount}/${data.records.length} records for ${user.handle}`,
    );
    return processedCount;
  } catch (error) {
    console.error(`❌ Error crawling ${user.handle} on ${user.pdsUrl}:`, error);
    throw error;
  }
}

function extractRkeyFromUri(uri: string): string {
  // Extract rkey from AT Protocol URI: at://did:plc:xyz/collection/rkey
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

function createResponse(
  recordsProcessed: number,
  errors: number,
  usersProcessed: number,
  duration: number,
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      type: "pds-crawler",
      records_processed: recordsProcessed,
      users_processed: usersProcessed,
      errors,
      duration_ms: duration,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
