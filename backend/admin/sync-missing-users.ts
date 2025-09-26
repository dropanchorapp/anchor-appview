// Repair mechanism to sync missing users from OAuth sessions to anchor_users
// Addresses the gap where OAuth succeeds but registerUser() fails

import { db } from "../database/db.ts";
import {
  anchorUsersTable,
  ironSessionStorageTable,
} from "../database/schema.ts";
import { like } from "https://esm.sh/drizzle-orm@0.44.5";

export async function syncMissingUsers(dryRun: boolean = true) {
  console.log("🔧 Starting user sync repair...");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE SYNC"}`);

  try {
    // Get all users from OAuth sessions (now stored in iron_session_storage) and anchor_users
    const [oauthSessions, anchorUsers] = await Promise.all([
      db.select({
        key: ironSessionStorageTable.key,
        value: ironSessionStorageTable.value,
        createdAt: ironSessionStorageTable.createdAt,
      }).from(ironSessionStorageTable)
        .where(like(ironSessionStorageTable.key, "session:%")),
      db.select({
        did: anchorUsersTable.did,
      }).from(anchorUsersTable),
    ]);

    // Parse OAuth session data
    const oauthUsers = oauthSessions.map((session) => {
      try {
        const sessionData = JSON.parse(session.value);
        return {
          did: session.key.replace("session:", ""),
          handle: sessionData.handle,
          pdsUrl: sessionData.pdsUrl,
          createdAt: session.createdAt,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Find users in OAuth but not in Anchor
    const anchorDids = new Set(anchorUsers.map((u) => u.did));
    const missingUsers = oauthUsers.filter((u) => !anchorDids.has(u.did));

    console.log(
      `\n📊 Found ${missingUsers.length} users missing from anchor_users:`,
    );

    const results = {
      total_missing: missingUsers.length,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{
        did: string;
        handle: string;
        status: string;
        reason?: string;
      }>,
    };

    for (const user of missingUsers) {
      console.log(`\n👤 Processing ${user.handle} (${user.did})`);

      // Skip users with missing PDS URL
      if (!user.pdsUrl) {
        console.log(`⚠️ Skipping ${user.handle}: Missing PDS URL`);
        results.skipped++;
        results.details.push({
          did: user.did,
          handle: user.handle,
          status: "skipped",
          reason: "Missing PDS URL",
        });
        continue;
      }

      results.attempted++;

      if (dryRun) {
        console.log(`🔍 Would register: ${user.handle} on ${user.pdsUrl}`);
        results.succeeded++;
        results.details.push({
          did: user.did,
          handle: user.handle,
          status: "would_register",
        });
      } else {
        try {
          // Register user directly without transactions (Val Town SQLite doesn't support them)
          const now = new Date().toISOString();

          // Insert user into anchor_users
          await db.insert(anchorUsersTable)
            .values({
              did: user.did,
              handle: user.handle,
              pdsUrl: user.pdsUrl,
              registeredAt: now,
            })
            .onConflictDoUpdate({
              target: anchorUsersTable.did,
              set: {
                handle: user.handle,
                pdsUrl: user.pdsUrl,
              },
            });

          // Import dependencies for PDS tracking
          const { sql } = await import("https://esm.sh/drizzle-orm@0.44.5");
          const { userPdsesTable } = await import("../database/schema.ts");

          // Update PDS reference count
          await db.insert(userPdsesTable)
            .values({
              pdsUrl: user.pdsUrl,
              userCount: 1,
              createdAt: now,
            })
            .onConflictDoUpdate({
              target: userPdsesTable.pdsUrl,
              set: {
                userCount: sql`${userPdsesTable.userCount} + 1`,
              },
            });

          console.log(`✅ Successfully registered ${user.handle}`);
          results.succeeded++;
          results.details.push({
            did: user.did,
            handle: user.handle,
            status: "registered",
          });
        } catch (error) {
          console.error(`❌ Failed to register ${user.handle}:`, error);
          results.failed++;
          results.details.push({
            did: user.did,
            handle: user.handle,
            status: "failed",
            reason: error.message,
          });
        }
      }
    }

    console.log(`\n=== Sync Results ===`);
    console.log(`Total missing: ${results.total_missing}`);
    console.log(`Attempted: ${results.attempted}`);
    console.log(
      `${dryRun ? "Would succeed" : "Succeeded"}: ${results.succeeded}`,
    );
    console.log(`Failed: ${results.failed}`);
    console.log(`Skipped: ${results.skipped}`);

    return {
      success: true,
      dry_run: dryRun,
      ...results,
    };
  } catch (error) {
    console.error("❌ User sync repair failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default syncMissingUsers;
