// Migration script to populate user tracking tables from existing data
// This script extracts users from existing checkins, oauth_sessions, and profile_cache
// and registers them in the new PDS tracking system

import { db, initializeTables } from "../backend/database/db.ts";
import {
  getUserStats,
  registerUser,
} from "../backend/database/user-tracking.ts";

interface ExistingUser {
  did: string;
  handle: string;
  pdsUrl: string;
  source: string; // 'checkins' | 'oauth_sessions' | 'profile_cache'
}

async function migrateUsersToTracking(): Promise<void> {
  console.log("🔄 Starting user migration to PDS tracking system...");

  try {
    // Initialize all database tables
    await initializeTables();

    // Collect unique users from all sources
    const allUsers = new Map<string, ExistingUser>();

    // 1. Extract users from oauth_sessions table
    console.log("📋 Extracting users from oauth_sessions...");
    const oauthUsers = await db.execute(`
      SELECT DISTINCT did, handle, pds_url 
      FROM oauth_sessions 
      WHERE did IS NOT NULL AND handle IS NOT NULL AND pds_url IS NOT NULL
    `);

    if (oauthUsers.rows) {
      for (const row of oauthUsers.rows) {
        const did = row.did as string;
        const handle = row.handle as string;
        const pdsUrl = row.pds_url as string;

        allUsers.set(did, { did, handle, pdsUrl, source: "oauth_sessions" });
      }
      console.log(
        `   Found ${oauthUsers.rows.length} users from OAuth sessions`,
      );
    }

    // 2. Extract users from checkins table (author_did)
    console.log("📋 Extracting users from checkins...");
    const checkinUsers = await db.execute(`
      SELECT DISTINCT author_did as did, author_handle as handle
      FROM checkins 
      WHERE author_did IS NOT NULL AND author_handle IS NOT NULL
    `);

    if (checkinUsers.rows) {
      for (const row of checkinUsers.rows) {
        const did = row.did as string;
        const handle = row.handle as string;

        // For checkin users without OAuth data, we need to discover their PDS
        if (!allUsers.has(did)) {
          // Try to resolve PDS from DID (we'll use a fallback)
          const pdsUrl = await discoverPDSFromDID(did) || "https://bsky.social";
          allUsers.set(did, { did, handle, pdsUrl, source: "checkins" });
        }
      }
      console.log(
        `   Found ${checkinUsers.rows.length} unique users from checkins`,
      );
    }

    // 3. Extract users from profile_cache
    console.log("📋 Extracting users from profile_cache...");
    const profileUsers = await db.execute(`
      SELECT DISTINCT did, handle
      FROM profile_cache 
      WHERE did IS NOT NULL AND handle IS NOT NULL
    `);

    if (profileUsers.rows) {
      for (const row of profileUsers.rows) {
        const did = row.did as string;
        const handle = row.handle as string;

        // For profile users without OAuth data, we need to discover their PDS
        if (!allUsers.has(did)) {
          const pdsUrl = await discoverPDSFromDID(did) || "https://bsky.social";
          allUsers.set(did, { did, handle, pdsUrl, source: "profile_cache" });
        }
      }
      console.log(
        `   Found ${profileUsers.rows.length} unique users from profile cache`,
      );
    }

    console.log(`\n📊 Total unique users found: ${allUsers.size}`);

    // 4. Register all users in the tracking system
    console.log("💾 Registering users in PDS tracking system...");
    let successCount = 0;
    let errorCount = 0;

    for (const [_did, user] of allUsers.entries()) {
      try {
        await registerUser(user.did, user.handle, user.pdsUrl);
        successCount++;
        console.log(
          `   ✅ Registered ${user.handle} (${
            user.did.slice(0, 20)
          }...) from ${user.source}`,
        );
      } catch (error) {
        errorCount++;
        console.log(`   ❌ Failed to register ${user.handle}: ${error}`);
      }
    }

    // 5. Show final statistics
    console.log("\n=== Migration Summary ===");
    console.log(`Total users processed: ${allUsers.size}`);
    console.log(`Successfully registered: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    const stats = await getUserStats();
    console.log(`Final registered users: ${stats.totalUsers}`);
    console.log(`Unique PDS servers: ${stats.totalPDSes}`);
    console.log("=== End Summary ===");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Helper function to discover PDS from DID
async function discoverPDSFromDID(did: string): Promise<string | null> {
  try {
    // Query PLC directory for DID document
    const response = await fetch(`https://plc.directory/${did}`);
    if (!response.ok) {
      console.warn(`   ⚠️ Could not resolve DID ${did}: ${response.status}`);
      return null;
    }

    const didDoc = await response.json();
    const pdsService = didDoc.service?.find((s: any) =>
      s.id.endsWith("#atproto_pds") && s.type === "AtprotoPersonalDataServer"
    );

    return pdsService?.serviceEndpoint || null;
  } catch (error) {
    console.warn(`   ⚠️ Error resolving DID ${did}:`, error);
    return null;
  }
}

// Run the migration
if (import.meta.main) {
  await migrateUsersToTracking();
}

export default migrateUsersToTracking;
