// User and PDS tracking for privacy-focused crawling
import { db } from "./db.ts";
import {
  anchorUsersTable,
  checkinsTable,
  ironSessionStorageTable,
  profileCacheTable,
  userPdsesTable,
} from "./schema.ts";
import { count, eq, sql } from "https://esm.sh/drizzle-orm@0.44.5";

export interface AnchorUser {
  did: string;
  handle: string;
  pdsUrl: string;
  registeredAt: string;
  lastCrawledAt?: string;
}

export interface UserPDS {
  pdsUrl: string;
  userCount: number;
  lastCrawledAt?: string;
  createdAt: string;
}

// User tracking table initialization is now handled by Drizzle migrations
// This eliminates duplicate table creation and ensures schema consistency
export function initializeUserTables(): void {
  console.log("User tracking tables initialized (via Drizzle migrations)");
}

// Register a new user (called during OAuth)
export async function registerUser(
  did: string,
  handle: string,
  pdsUrl: string,
): Promise<void> {
  console.log(`📝 Registering user ${handle} (${did}) on PDS ${pdsUrl}`);

  try {
    const now = new Date().toISOString();

    // Insert or update user using Drizzle (no transaction - Val Town SQLite doesn't support them)
    await db.insert(anchorUsersTable)
      .values({
        did,
        handle,
        pdsUrl: pdsUrl,
        registeredAt: now,
      })
      .onConflictDoUpdate({
        target: anchorUsersTable.did,
        set: {
          handle,
          pdsUrl: pdsUrl,
        },
      });

    // Update PDS reference count using Drizzle
    await db.insert(userPdsesTable)
      .values({
        pdsUrl,
        userCount: 1,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: userPdsesTable.pdsUrl,
        set: {
          userCount: sql`${userPdsesTable.userCount} + 1`,
        },
      });

    console.log(`✅ Successfully registered user ${handle}`);
  } catch (error) {
    console.error(`❌ Failed to register user ${handle}:`, error);
    throw error;
  }
}

// Remove a user and clean up unused PDSs
export async function removeUser(did: string): Promise<void> {
  console.log(`🗑️ Removing user ${did}`);

  try {
    // Get user's PDS before deletion using Drizzle (no transaction - Val Town SQLite doesn't support them)
    const userResult = await db.select({ pdsUrl: anchorUsersTable.pdsUrl })
      .from(anchorUsersTable)
      .where(eq(anchorUsersTable.did, did))
      .limit(1);

    if (userResult.length === 0) {
      console.log(`User ${did} not found, nothing to remove`);
      return;
    }

    const pdsUrl = userResult[0].pdsUrl;
    if (!pdsUrl) {
      console.log(`User ${did} has no PDS URL, only removing user record`);
      await db.delete(anchorUsersTable)
        .where(eq(anchorUsersTable.did, did));
      return;
    }

    // Remove user using Drizzle
    await db.delete(anchorUsersTable)
      .where(eq(anchorUsersTable.did, did));

    // Decrease PDS reference count using Drizzle
    await db.update(userPdsesTable)
      .set({ userCount: sql`${userPdsesTable.userCount} - 1` })
      .where(eq(userPdsesTable.pdsUrl, pdsUrl));

    // Remove PDS if no users left using Drizzle
    await db.delete(userPdsesTable)
      .where(
        sql`${userPdsesTable.pdsUrl} = ${pdsUrl} AND ${userPdsesTable.userCount} <= 0`,
      );

    console.log(
      `✅ Successfully removed user ${did} and cleaned up PDS ${pdsUrl}`,
    );
  } catch (error) {
    console.error(`❌ Failed to remove user ${did}:`, error);
    throw error;
  }
}

// Get all registered users for crawling
export async function getRegisteredUsers(): Promise<AnchorUser[]> {
  const result = await db.select({
    did: anchorUsersTable.did,
    handle: anchorUsersTable.handle,
    pdsUrl: anchorUsersTable.pdsUrl,
    registeredAt: anchorUsersTable.registeredAt,
    lastCheckinCrawl: anchorUsersTable.lastCheckinCrawl,
  })
    .from(anchorUsersTable)
    .orderBy(sql`${anchorUsersTable.lastCheckinCrawl} ASC NULLS FIRST`);

  return result.map((row) => ({
    did: row.did,
    handle: row.handle || "",
    pdsUrl: row.pdsUrl || "",
    registeredAt: row.registeredAt || "",
    lastCrawledAt: row.lastCheckinCrawl || undefined,
  }));
}

// Get all monitored PDS servers
export async function getMonitoredPDSes(): Promise<UserPDS[]> {
  const result = await db.select()
    .from(userPdsesTable)
    .where(sql`${userPdsesTable.userCount} > 0`)
    .orderBy(sql`${userPdsesTable.lastCrawledAt} ASC NULLS FIRST`);

  return result.map((row) => ({
    pdsUrl: row.pdsUrl,
    userCount: row.userCount || 1,
    lastCrawledAt: row.lastCrawledAt || undefined,
    createdAt: row.createdAt || "",
  }));
}

// Update user's last crawled timestamp
export async function updateUserLastCrawled(did: string): Promise<void> {
  await db.update(anchorUsersTable)
    .set({ lastCheckinCrawl: new Date().toISOString() })
    .where(eq(anchorUsersTable.did, did));
}

// Update user's last follower crawl timestamp
export async function updateUserLastFollowerCrawl(did: string): Promise<void> {
  await db.update(anchorUsersTable)
    .set({ lastFollowerCrawl: new Date().toISOString() })
    .where(eq(anchorUsersTable.did, did));
}

// Update PDS last crawled timestamp
export async function updatePDSLastCrawled(pdsUrl: string): Promise<void> {
  await db.update(userPdsesTable)
    .set({ lastCrawledAt: new Date().toISOString() })
    .where(eq(userPdsesTable.pdsUrl, pdsUrl));
}

// Get user statistics
export async function getUserStats(): Promise<{
  totalUsers: number;
  totalPDSes: number;
  recentlyActive: number;
}> {
  const [usersResult, pdsResult, activeResult] = await Promise.all([
    db.select({ count: count() }).from(anchorUsersTable),
    db.select({ count: count() })
      .from(userPdsesTable)
      .where(sql`${userPdsesTable.userCount} > 0`),
    db.select({ count: count() })
      .from(anchorUsersTable)
      .where(
        sql`${anchorUsersTable.lastCheckinCrawl} > datetime('now', '-1 hour')`,
      ),
  ]);

  return {
    totalUsers: usersResult[0]?.count || 0,
    totalPDSes: pdsResult[0]?.count || 0,
    recentlyActive: activeResult[0]?.count || 0,
  };
}

// Get migration statistics - check existing data that could be migrated
export async function getMigrationStats(): Promise<{
  oauthSessions: number;
  uniqueCheckinAuthors: number;
  cachedProfiles: number;
  currentlyTracked: number;
}> {
  const [oauthResult, authorsResult, profilesResult, trackedResult] =
    await Promise.all([
      db.select({ count: count() })
        .from(ironSessionStorageTable)
        .where(sql`${ironSessionStorageTable.key} LIKE 'session:%'`),
      db.select({ count: sql<number>`count(distinct ${checkinsTable.did})` })
        .from(checkinsTable)
        .where(
          sql`${checkinsTable.did} IS NOT NULL AND ${checkinsTable.handle} IS NOT NULL`,
        ),
      db.select({ count: count() })
        .from(profileCacheTable)
        .where(
          sql`${profileCacheTable.did} IS NOT NULL AND ${profileCacheTable.handle} IS NOT NULL`,
        ),
      db.select({ count: count() }).from(anchorUsersTable),
    ]);

  return {
    oauthSessions: oauthResult[0]?.count || 0,
    uniqueCheckinAuthors: authorsResult[0]?.count || 0,
    cachedProfiles: profilesResult[0]?.count || 0,
    currentlyTracked: trackedResult[0]?.count || 0,
  };
}
