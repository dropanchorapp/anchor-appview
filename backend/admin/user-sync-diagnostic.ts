// Diagnostic to compare oauth_sessions vs anchor_users tables
// Helps identify sync issues between authentication and crawler tracking

import { db } from "../database/db.ts";
import { anchorUsersTable, oauthSessionsTable } from "../database/schema.ts";
import { count } from "https://esm.sh/drizzle-orm";

export async function userSyncDiagnostic() {
  console.log("🔍 Running user sync diagnostic...");

  try {
    // Count users in both tables
    const [oauthCount, anchorCount] = await Promise.all([
      db.select({ count: count() }).from(oauthSessionsTable),
      db.select({ count: count() }).from(anchorUsersTable),
    ]);

    const oauthTotal = oauthCount[0]?.count || 0;
    const anchorTotal = anchorCount[0]?.count || 0;

    console.log(`OAuth sessions: ${oauthTotal}`);
    console.log(`Anchor users: ${anchorTotal}`);

    // Get all users from both tables
    const [oauthUsers, anchorUsers] = await Promise.all([
      db.select({
        did: oauthSessionsTable.did,
        handle: oauthSessionsTable.handle,
        pdsUrl: oauthSessionsTable.pdsUrl,
        createdAt: oauthSessionsTable.createdAt,
      }).from(oauthSessionsTable),
      db.select({
        did: anchorUsersTable.did,
        handle: anchorUsersTable.handle,
        pdsUrl: anchorUsersTable.pdsUrl,
        registeredAt: anchorUsersTable.registeredAt,
      }).from(anchorUsersTable),
    ]);

    // Find users in OAuth but not in Anchor
    const anchorDids = new Set(anchorUsers.map((u) => u.did));
    const missingFromAnchor = oauthUsers.filter((u) => !anchorDids.has(u.did));

    // Find users in Anchor but not in OAuth (shouldn't happen normally)
    const oauthDids = new Set(oauthUsers.map((u) => u.did));
    const missingFromOauth = anchorUsers.filter((u) => !oauthDids.has(u.did));

    console.log(`\n📊 Sync Analysis:`);
    console.log(`Users in OAuth only: ${missingFromAnchor.length}`);
    console.log(`Users in Anchor only: ${missingFromOauth.length}`);
    console.log(`Users in both: ${anchorTotal - missingFromOauth.length}`);

    if (missingFromAnchor.length > 0) {
      console.log(`\n❌ Users missing from anchor_users:`);
      missingFromAnchor.forEach((user) => {
        console.log(`- ${user.handle} (${user.did}) on ${user.pdsUrl}`);
      });
    }

    if (missingFromOauth.length > 0) {
      console.log(`\n⚠️ Users missing from oauth_sessions:`);
      missingFromOauth.forEach((user) => {
        console.log(`- ${user.handle} (${user.did}) on ${user.pdsUrl}`);
      });
    }

    return {
      success: true,
      oauth_total: oauthTotal,
      anchor_total: anchorTotal,
      missing_from_anchor: missingFromAnchor.length,
      missing_from_oauth: missingFromOauth.length,
      missing_users: missingFromAnchor.map((u) => ({
        did: u.did,
        handle: u.handle,
        pdsUrl: u.pdsUrl,
        oauth_created: u.createdAt,
      })),
      orphaned_users: missingFromOauth.map((u) => ({
        did: u.did,
        handle: u.handle,
        pdsUrl: u.pdsUrl,
        registered_at: u.registeredAt,
      })),
    };
  } catch (error) {
    console.error("❌ User sync diagnostic failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default userSyncDiagnostic;
