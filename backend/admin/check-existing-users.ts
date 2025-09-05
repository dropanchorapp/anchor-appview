// Diagnostic script to check what existing user data we have
// This helps us understand what can be migrated to the PDS tracking system

import { db } from "../database/db.ts";
import {
  anchorUsersTable,
  checkinsTable,
  oauthSessionsTable,
  profileCacheTable,
  userPdsesTable,
} from "../database/schema.ts";
import { count, desc, sql } from "https://esm.sh/drizzle-orm";

export async function checkExistingUsers() {
  console.log("🔍 Checking existing user data in database...");

  try {
    // Skip initializeTables() as tables already exist - this was causing timeouts
    // await initializeTables();

    // Check oauth_sessions table
    console.log("\n📋 OAuth Sessions:");
    const oauthSessions = await db
      .select({
        did: oauthSessionsTable.did,
        handle: oauthSessionsTable.handle,
        pdsUrl: oauthSessionsTable.pdsUrl,
        createdAt: oauthSessionsTable.createdAt,
      })
      .from(oauthSessionsTable)
      .orderBy(desc(oauthSessionsTable.createdAt))
      .limit(10);

    if (oauthSessions.length > 0) {
      console.log(
        `   Found ${oauthSessions.length} OAuth sessions (showing first 10):`,
      );
      for (const row of oauthSessions) {
        console.log(`   - ${row.handle} (${row.did}) on ${row.pdsUrl}`);
      }

      const totalOAuth = await db
        .select({ count: count() })
        .from(oauthSessionsTable);
      console.log(`   Total OAuth sessions: ${totalOAuth[0]?.count || 0}`);
    } else {
      console.log("   No OAuth sessions found");
    }

    // Check checkins table
    console.log("\n📍 Checkins:");
    const checkinAuthors = await db
      .select({
        did: checkinsTable.did,
        handle: checkinsTable.handle,
        checkinCount: count(checkinsTable.id).as("checkin_count"),
      })
      .from(checkinsTable)
      .groupBy(checkinsTable.did, checkinsTable.handle)
      .orderBy(desc(sql`checkin_count`))
      .limit(10);

    if (checkinAuthors.length > 0) {
      console.log(
        `   Found ${checkinAuthors.length} unique authors (showing top 10 by checkin count):`,
      );
      for (const row of checkinAuthors) {
        console.log(
          `   - ${row.handle} (${row.did}) - ${row.checkinCount} checkins`,
        );
      }

      const totalAuthors = await db
        .select({ count: count(sql`DISTINCT ${checkinsTable.did}`) })
        .from(checkinsTable);
      console.log(`   Total unique authors: ${totalAuthors[0]?.count || 0}`);

      const totalCheckins = await db
        .select({ count: count() })
        .from(checkinsTable);
      console.log(`   Total checkins: ${totalCheckins[0]?.count || 0}`);
    } else {
      console.log("   No checkins found");
    }

    // Check profile_cache table
    console.log("\n👤 Profile Cache:");
    const profiles = await db
      .select({
        did: profileCacheTable.did,
        handle: profileCacheTable.handle,
        displayName: profileCacheTable.displayName,
        updatedAt: profileCacheTable.updatedAt,
      })
      .from(profileCacheTable)
      .orderBy(desc(profileCacheTable.updatedAt))
      .limit(10);

    if (profiles.length > 0) {
      console.log(
        `   Found ${profiles.length} cached profiles (showing first 10):`,
      );
      for (const row of profiles) {
        const displayName = row.displayName ? ` (${row.displayName})` : "";
        console.log(`   - ${row.handle}${displayName} (${row.did})`);
      }

      const totalProfiles = await db
        .select({ count: count() })
        .from(profileCacheTable);
      console.log(`   Total cached profiles: ${totalProfiles[0]?.count || 0}`);
    } else {
      console.log("   No cached profiles found");
    }

    // Check current user tracking tables
    console.log("\n🕸️ Current PDS Tracking:");
    const trackingUsers = await db
      .select({ count: count() })
      .from(anchorUsersTable);

    const trackingPDSes = await db
      .select({ count: count() })
      .from(userPdsesTable)
      .where(sql`${userPdsesTable.userCount} > 0`);

    console.log(`   Registered users: ${trackingUsers[0]?.count || 0}`);
    console.log(`   Tracked PDS servers: ${trackingPDSes[0]?.count || 0}`);

    if ((trackingUsers[0]?.count || 0) > 0) {
      console.log("   Current tracked users:");
      const currentUsers = await db
        .select({
          did: anchorUsersTable.did,
          handle: anchorUsersTable.handle,
          pdsUrl: anchorUsersTable.pdsUrl,
          registeredAt: anchorUsersTable.registeredAt,
        })
        .from(anchorUsersTable)
        .orderBy(desc(anchorUsersTable.registeredAt))
        .limit(5);

      for (const row of currentUsers) {
        console.log(`   - ${row.handle} (${row.did}) on ${row.pdsUrl}`);
      }
    }

    // Summary
    console.log("\n=== Summary ===");
    const [oauthCount, uniqueAuthors, profileCount, currentTracked] =
      await Promise.all([
        db.select({ count: count() }).from(oauthSessionsTable),
        db.select({ count: count(sql`DISTINCT ${checkinsTable.did}`) }).from(
          checkinsTable,
        ),
        db.select({ count: count() }).from(profileCacheTable),
        db.select({ count: count() }).from(anchorUsersTable),
      ]);

    console.log(`OAuth sessions: ${oauthCount[0]?.count || 0}`);
    console.log(`Unique checkin authors: ${uniqueAuthors[0]?.count || 0}`);
    console.log(`Cached profiles: ${profileCount[0]?.count || 0}`);
    console.log(
      `Currently tracked for PDS crawling: ${currentTracked[0]?.count || 0}`,
    );
    console.log("=================");

    return {
      oauthSessions: oauthCount[0]?.count || 0,
      uniqueCheckinAuthors: uniqueAuthors[0]?.count || 0,
      cachedProfiles: profileCount[0]?.count || 0,
      currentlyTracked: currentTracked[0]?.count || 0,
    };
  } catch (error) {
    console.error("❌ Error checking existing users:", error);
    throw error;
  }
}

// Run the diagnostic check
if (import.meta.main) {
  await checkExistingUsers();
}

export default checkExistingUsers;
