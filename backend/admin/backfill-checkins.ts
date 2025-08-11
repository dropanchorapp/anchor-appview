// Comprehensive checkin backfill script using Drizzle ORM
// Combines incremental and clean-slate backfill functionality
import { db } from "../database/db.ts";
import {
  anchorUsersTable,
  checkinsTable,
  profileCacheTable,
} from "../database/schema.ts";
import { count, eq } from "https://esm.sh/drizzle-orm";

interface CheckinRecord {
  uri: string;
  cid: string;
  value: {
    text: string;
    createdAt: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    addressRef?: {
      uri: string;
      cid: string;
    };
  };
}

interface DiscoveredCheckin {
  rkey: string;
  uri: string;
  authorDid: string;
  record: CheckinRecord;
}

interface BackfillOptions {
  mode: "incremental" | "clean";
  batchSize?: number;
  rateLimitMs?: number;
  maxUsers?: number;
}

interface BackfillResults {
  discovered: number;
  stored: number;
  skipped: number;
  users: number;
  errors: number;
}

export class CheckinBackfillService {
  private discoveredCheckins = new Map<string, DiscoveredCheckin>();
  private processedDids = new Set<string>();
  private options: Required<BackfillOptions>;

  constructor(options: BackfillOptions) {
    this.options = {
      mode: options.mode,
      batchSize: options.batchSize || 5,
      rateLimitMs: options.rateLimitMs || 1000,
      maxUsers: options.maxUsers || 1000,
    };
  }

  // Get all users we should crawl for checkins
  async getKnownUsers(): Promise<string[]> {
    console.log("🔍 Discovering users to crawl...");

    // Get distinct DIDs from all sources using Drizzle
    const [checkinDids, profileDids, anchorUserDids] = await Promise.all([
      db.selectDistinct({ did: checkinsTable.did }).from(checkinsTable),
      db.selectDistinct({ did: profileCacheTable.did }).from(profileCacheTable),
      db.selectDistinct({ did: anchorUsersTable.did }).from(anchorUsersTable),
    ]);

    // Combine and deduplicate
    const allDids = new Set([
      ...checkinDids.map((r: { did: string }) => r.did),
      ...profileDids.map((r: { did: string }) => r.did),
      ...anchorUserDids.map((r: { did: string }) => r.did),
    ]);

    const users = Array.from(allDids).sort().slice(0, this.options.maxUsers);
    console.log(
      `👥 Found ${users.length} users to process (limited to ${this.options.maxUsers})`,
    );
    return users;
  }

  // Resolve DID to PDS endpoint
  async resolvePDS(did: string): Promise<string | null> {
    try {
      if (did.startsWith("did:plc:")) {
        const response = await fetch(`https://plc.directory/${did}`);
        if (!response.ok) return null;

        const data = await response.json();
        for (const service of data.service || []) {
          if (service.id === "#atproto_pds" && service.serviceEndpoint) {
            return service.serviceEndpoint;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // Get checkin records for a specific DID from their PDS
  async getCheckinRecords(did: string): Promise<CheckinRecord[]> {
    try {
      // First resolve DID to get their PDS endpoint
      const pdsEndpoint = await this.resolvePDS(did);
      if (!pdsEndpoint) {
        console.log(`⚠️  Could not resolve PDS for ${did}`);
        return [];
      }

      const url = `${pdsEndpoint}/xrpc/com.atproto.repo.listRecords`;
      const params = new URLSearchParams({
        repo: did,
        collection: "app.dropanchor.checkin",
        limit: "100",
        reverse: "true",
      });

      const response = await fetch(`${url}?${params}`, {
        headers: {
          "User-Agent": "Anchor-AppView/1.0",
        },
      });

      if (!response.ok) {
        if (response.status === 400) {
          // Repository not found or no records - this is normal
          return [];
        }
        console.log(
          `⚠️  Failed to fetch records for ${did}: ${response.status}`,
        );
        return [];
      }

      const data = await response.json();
      return data.records || [];
    } catch (error) {
      console.error(`❌ Error fetching checkins for ${did}:`, error);
      return [];
    }
  }

  // Store checkins using Drizzle ORM
  async storeCheckins(
    checkins: DiscoveredCheckin[],
  ): Promise<{ stored: number; skipped: number; errors: number }> {
    let stored = 0;
    let skipped = 0;
    let errors = 0;

    for (const checkin of checkins) {
      try {
        // Check if already exists using Drizzle
        const existing = await db.select({ id: checkinsTable.id })
          .from(checkinsTable)
          .where(eq(checkinsTable.id, checkin.rkey))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue; // Skip existing
        }

        // Extract coordinates
        const lat = checkin.record.value.coordinates?.latitude || null;
        const lng = checkin.record.value.coordinates?.longitude || null;

        // Use Drizzle insert for type safety
        const rkey = checkin.uri.split("/").pop() || checkin.rkey;
        const now = new Date().toISOString();

        await db.insert(checkinsTable).values({
          id: checkin.rkey,
          uri: checkin.uri,
          rkey,
          did: checkin.authorDid,
          text: checkin.record.value.text || "",
          latitude: lat,
          longitude: lng,
          venueName: null, // will be resolved later
          createdAt: checkin.record.value.createdAt || now,
          indexedAt: now,
        });

        stored++;
        if (stored % 10 === 0) {
          console.log(`✅ Stored ${stored} checkins so far...`);
        }
      } catch (error) {
        console.error(`❌ Failed to store checkin ${checkin.rkey}:`, error);
        errors++;
      }
    }

    return { stored, skipped, errors };
  }

  // Discover checkins for a specific DID
  async discoverCheckinsForDid(did: string): Promise<DiscoveredCheckin[]> {
    if (this.processedDids.has(did)) {
      return [];
    }

    this.processedDids.add(did);
    const checkins: DiscoveredCheckin[] = [];

    try {
      const records = await this.getCheckinRecords(did);

      for (const record of records) {
        const rkey = record.uri.split("/").pop() || "";
        const checkin: DiscoveredCheckin = {
          rkey,
          uri: record.uri,
          authorDid: did,
          record,
        };

        checkins.push(checkin);
        this.discoveredCheckins.set(record.uri, checkin);
      }

      if (checkins.length > 0) {
        console.log(`🔍 Found ${checkins.length} checkins for ${did}`);
      }
    } catch (error) {
      console.error(`❌ Failed to discover checkins for ${did}:`, error);
    }

    return checkins;
  }

  // Clean slate: clear database before backfill
  async cleanDatabase(): Promise<void> {
    if (this.options.mode !== "clean") {
      return;
    }

    console.log("🧹 Performing clean slate operation...");

    try {
      // Get count before cleaning
      const beforeCount = await db.select({ count: count() }).from(
        checkinsTable,
      );
      console.log(
        `📊 Database contains ${
          beforeCount[0]?.count || 0
        } checkins before cleaning`,
      );

      // Clear checkins table
      await db.delete(checkinsTable);
      console.log("✅ Cleared checkins table");

      // Verify cleaning
      const afterCount = await db.select({ count: count() }).from(
        checkinsTable,
      );
      console.log(
        `📊 Database contains ${
          afterCount[0]?.count || 0
        } checkins after cleaning`,
      );
    } catch (error) {
      console.error("❌ Failed to clean database:", error);
      throw error;
    }
  }

  // Main backfill process
  async runBackfill(): Promise<BackfillResults> {
    console.log(`🚀 Starting ${this.options.mode} checkin backfill...`);

    // Clean database if needed
    await this.cleanDatabase();

    // Get all known users
    const knownUsers = await this.getKnownUsers();

    let totalDiscovered = 0;
    let totalStored = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Process users in batches to avoid overwhelming PDS servers
    const { batchSize, rateLimitMs } = this.options;

    for (let i = 0; i < knownUsers.length; i += batchSize) {
      const batch = knownUsers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(knownUsers.length / batchSize);

      console.log(
        `📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} users)`,
      );

      // Process batch in parallel
      const batchPromises = batch.map((did) =>
        this.discoverCheckinsForDid(did)
      );
      const batchResults = await Promise.all(batchPromises);

      // Store all discovered checkins from this batch
      for (const checkins of batchResults) {
        if (checkins.length > 0) {
          const results = await this.storeCheckins(checkins);
          totalDiscovered += checkins.length;
          totalStored += results.stored;
          totalSkipped += results.skipped;
          totalErrors += results.errors;
        }
      }

      // Progress report
      console.log(
        `📊 Batch ${batchNum} complete: +${totalStored} stored, ${totalSkipped} skipped, ${totalErrors} errors`,
      );

      // Rate limiting: wait between batches
      if (i + batchSize < knownUsers.length) {
        console.log(`⏱️  Rate limiting: waiting ${rateLimitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, rateLimitMs));
      }
    }

    return {
      discovered: totalDiscovered,
      stored: totalStored,
      skipped: totalSkipped,
      users: knownUsers.length,
      errors: totalErrors,
    };
  }

  // Get final statistics
  async getFinalStats() {
    const totalCount = await db.select({ count: count() }).from(checkinsTable);
    const uniqueUsers = await db.select({ count: count() }).from(
      db.selectDistinct({ did: checkinsTable.did }).from(checkinsTable).as(
        "unique_users",
      ),
    );

    return {
      totalCheckinsInDatabase: totalCount[0]?.count || 0,
      uniqueUsersWithCheckins: uniqueUsers[0]?.count || 0,
    };
  }
}

// Default export for Val Town compatibility
export default async function (
  options?: Partial<BackfillOptions>,
): Promise<Response> {
  const backfillOptions: BackfillOptions = {
    mode: "incremental", // default to incremental
    ...options,
  };

  try {
    console.log(`🚀 Starting ${backfillOptions.mode} checkin backfill...`);
    const startTime = Date.now();

    const service = new CheckinBackfillService(backfillOptions);
    const results = await service.runBackfill();
    const finalStats = await service.getFinalStats();

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      mode: backfillOptions.mode,
      message:
        `${backfillOptions.mode} checkin backfill completed successfully`,
      results: {
        usersProcessed: results.users,
        checkinsDiscovered: results.discovered,
        checkinsStored: results.stored,
        checkinsSkipped: results.skipped,
        errors: results.errors,
        ...finalStats,
      },
      performance: {
        durationMs: duration,
        durationHuman: `${Math.round(duration / 1000)}s`,
        checkinsPerSecond: results.stored > 0
          ? Math.round(results.stored / (duration / 1000))
          : 0,
      },
      timestamp: new Date().toISOString(),
    };

    console.log("✅ Backfill completed:", summary);

    return new Response(JSON.stringify(summary, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Backfill failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        mode: backfillOptions.mode,
        error: `${backfillOptions.mode} backfill failed`,
        details: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
