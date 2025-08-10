// Diagnostic script to check what existing user data we have
// This helps us understand what can be migrated to the PDS tracking system

import { db, initializeTables } from "../backend/database/db.ts";

async function checkExistingUsers(): Promise<void> {
  console.log("🔍 Checking existing user data in database...");

  try {
    await initializeTables();

    // Check oauth_sessions table
    console.log("\n📋 OAuth Sessions:");
    const oauthResult = await db.execute(`
      SELECT did, handle, pds_url, created_at 
      FROM oauth_sessions 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    if (oauthResult.rows && oauthResult.rows.length > 0) {
      console.log(
        `   Found ${oauthResult.rows.length} OAuth sessions (showing first 10):`,
      );
      for (const row of oauthResult.rows) {
        console.log(`   - ${row.handle} (${row.did}) on ${row.pds_url}`);
      }

      const totalOAuth = await db.execute(
        "SELECT COUNT(*) as count FROM oauth_sessions",
      );
      console.log(
        `   Total OAuth sessions: ${totalOAuth.rows?.[0]?.count || 0}`,
      );
    } else {
      console.log("   No OAuth sessions found");
    }

    // Check checkins table
    console.log("\n📍 Checkins:");
    const checkinsResult = await db.execute(`
      SELECT DISTINCT did, handle, COUNT(*) as checkin_count
      FROM checkins 
      GROUP BY did, handle
      ORDER BY checkin_count DESC
      LIMIT 10
    `);

    if (checkinsResult.rows && checkinsResult.rows.length > 0) {
      console.log(
        `   Found ${checkinsResult.rows.length} unique authors (showing top 10 by checkin count):`,
      );
      for (const row of checkinsResult.rows) {
        console.log(
          `   - ${row.handle} (${row.did}) - ${row.checkin_count} checkins`,
        );
      }

      const totalAuthors = await db.execute(`
        SELECT COUNT(DISTINCT did) as count FROM checkins WHERE did IS NOT NULL
      `);
      console.log(
        `   Total unique authors: ${totalAuthors.rows?.[0]?.count || 0}`,
      );

      const totalCheckins = await db.execute(
        "SELECT COUNT(*) as count FROM checkins",
      );
      console.log(`   Total checkins: ${totalCheckins.rows?.[0]?.count || 0}`);
    } else {
      console.log("   No checkins found");
    }

    // Check profile_cache table
    console.log("\n👤 Profile Cache:");
    const profileResult = await db.execute(`
      SELECT did, handle, display_name, updated_at 
      FROM profile_cache 
      ORDER BY updated_at DESC 
      LIMIT 10
    `);

    if (profileResult.rows && profileResult.rows.length > 0) {
      console.log(
        `   Found ${profileResult.rows.length} cached profiles (showing first 10):`,
      );
      for (const row of profileResult.rows) {
        const displayName = row.display_name ? ` (${row.display_name})` : "";
        console.log(`   - ${row.handle}${displayName} (${row.did})`);
      }

      const totalProfiles = await db.execute(
        "SELECT COUNT(*) as count FROM profile_cache",
      );
      console.log(
        `   Total cached profiles: ${totalProfiles.rows?.[0]?.count || 0}`,
      );
    } else {
      console.log("   No cached profiles found");
    }

    // Check current user tracking tables
    console.log("\n🕸️ Current PDS Tracking:");
    const trackingUsers = await db.execute(
      "SELECT COUNT(*) as count FROM anchor_users",
    );
    const trackingPDSes = await db.execute(
      "SELECT COUNT(*) as count FROM user_pdses WHERE user_count > 0",
    );

    console.log(`   Registered users: ${trackingUsers.rows?.[0]?.count || 0}`);
    console.log(
      `   Tracked PDS servers: ${trackingPDSes.rows?.[0]?.count || 0}`,
    );

    if (trackingUsers.rows?.[0]?.count > 0) {
      console.log("   Current tracked users:");
      const currentUsers = await db.execute(`
        SELECT did, handle, pds_url, registered_at 
        FROM anchor_users 
        ORDER BY registered_at DESC 
        LIMIT 5
      `);
      for (const row of currentUsers.rows || []) {
        console.log(`   - ${row.handle} (${row.did}) on ${row.pds_url}`);
      }
    }

    // Summary
    console.log("\n=== Summary ===");
    const oauthCount = await db.execute(
      "SELECT COUNT(*) as count FROM oauth_sessions",
    );
    const uniqueAuthors = await db.execute(
      "SELECT COUNT(DISTINCT did) as count FROM checkins WHERE did IS NOT NULL",
    );
    const profileCount = await db.execute(
      "SELECT COUNT(*) as count FROM profile_cache",
    );
    const currentTracked = await db.execute(
      "SELECT COUNT(*) as count FROM anchor_users",
    );

    console.log(`OAuth sessions: ${oauthCount.rows?.[0]?.count || 0}`);
    console.log(
      `Unique checkin authors: ${uniqueAuthors.rows?.[0]?.count || 0}`,
    );
    console.log(`Cached profiles: ${profileCount.rows?.[0]?.count || 0}`);
    console.log(
      `Currently tracked for PDS crawling: ${
        currentTracked.rows?.[0]?.count || 0
      }`,
    );
    console.log("=================");
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
