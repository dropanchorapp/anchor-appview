// Followers processor - handles syncing following relationships to database
import { db } from "../database/db.ts";
import { anchorUsersTable, userFollowsTable } from "../database/schema.ts";
import { and, count, eq, inArray, sql } from "https://esm.sh/drizzle-orm";

interface FollowRelationship {
  did: string;
  createdAt: string;
}

/**
 * Sync a user's complete following list to the database using incremental updates
 * Only adds new follows and removes unfollows (more efficient than full replacement)
 */
export async function syncUserFollows(
  userDid: string,
  follows: FollowRelationship[],
): Promise<{ followsAdded: number; followsRemoved: number }> {
  console.log(`🔄 Syncing ${follows.length} follows for ${userDid}`);

  try {
    // Get existing follows from database using Drizzle
    const existingResult = await db.select({
      followingDid: userFollowsTable.followingDid,
    })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followerDid, userDid));

    const existingFollows = new Set(
      existingResult.map((row) => row.followingDid),
    );

    const newFollows = new Set(follows.map((f) => f.did));

    // Calculate changes
    const toAdd = follows.filter((follow) => !existingFollows.has(follow.did));
    const toRemove = Array.from(existingFollows).filter((did) =>
      !newFollows.has(did)
    );

    // Remove unfollows using Drizzle
    if (toRemove.length > 0) {
      // Process in smaller batches to avoid query limits
      const batchSize = 50;
      for (let i = 0; i < toRemove.length; i += batchSize) {
        const batch = toRemove.slice(i, i + batchSize);
        await db.delete(userFollowsTable)
          .where(
            and(
              eq(userFollowsTable.followerDid, userDid),
              inArray(userFollowsTable.followingDid, batch),
            ),
          );
      }
      console.log(`🗑️ Removed ${toRemove.length} unfollows for ${userDid}`);
    }

    // Add new follows in batches using Drizzle
    if (toAdd.length > 0) {
      const batchSize = 50; // Smaller batches for Val Town
      let inserted = 0;

      for (let i = 0; i < toAdd.length; i += batchSize) {
        const batch = toAdd.slice(i, i + batchSize);
        const now = new Date().toISOString();

        // Prepare batch insert values
        const values = batch.map((follow) => ({
          followerDid: userDid,
          followingDid: follow.did,
          createdAt: follow.createdAt,
          syncedAt: now,
        }));

        try {
          await db.insert(userFollowsTable)
            .values(values)
            .onConflictDoNothing();

          inserted += batch.length;

          console.log(
            `📝 Added batch ${Math.floor(i / batchSize) + 1}/${
              Math.ceil(toAdd.length / batchSize)
            } (${inserted}/${toAdd.length} new follows)`,
          );
        } catch (batchError) {
          console.error(
            `❌ Batch insert failed for batch ${
              Math.floor(i / batchSize) + 1
            }:`,
            batchError,
          );
          // Continue with next batch instead of failing completely
        }
      }
    }

    console.log(
      `✅ Successfully synced follows for ${userDid}: +${toAdd.length} -${toRemove.length}`,
    );

    return {
      followsAdded: toAdd.length,
      followsRemoved: toRemove.length,
    };
  } catch (error) {
    console.error(`❌ Failed to sync follows for ${userDid}:`, error);
    throw error;
  }
}

/**
 * Get statistics about following relationships
 */
export async function getFollowsStats(): Promise<{
  totalFollowRelationships: number;
  usersWithFollows: number;
  averageFollowsPerUser: number;
  lastSyncedUser?: string;
}> {
  const [totalResult, usersResult, lastSyncResult] = await Promise.all([
    db.select({ count: count() }).from(userFollowsTable),
    db.select({
      count: sql<number>`count(distinct ${userFollowsTable.followerDid})`,
    })
      .from(userFollowsTable),
    db.select({
      followerDid: userFollowsTable.followerDid,
      syncedAt: userFollowsTable.syncedAt,
    })
      .from(userFollowsTable)
      .orderBy(sql`${userFollowsTable.syncedAt} DESC`)
      .limit(1),
  ]);

  const totalFollowRelationships = totalResult[0]?.count || 0;
  const usersWithFollows = usersResult[0]?.count || 0;
  const averageFollowsPerUser = usersWithFollows > 0
    ? Math.round(totalFollowRelationships / usersWithFollows)
    : 0;

  return {
    totalFollowRelationships,
    usersWithFollows,
    averageFollowsPerUser,
    lastSyncedUser: lastSyncResult[0]?.followerDid,
  };
}

/**
 * Get users who need their follows refreshed
 * Returns users who haven't had follows synced recently
 */
export async function getUsersNeedingFollowsRefresh(
  maxAgeHours = 168, // 1 week default
  limit = 10,
): Promise<Array<{ did: string; handle: string; lastFollowerCrawl?: string }>> {
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
    .toISOString();

  const result = await db.select({
    did: anchorUsersTable.did,
    handle: anchorUsersTable.handle,
    lastFollowerCrawl: anchorUsersTable.lastFollowerCrawl,
  })
    .from(anchorUsersTable)
    .where(
      sql`${anchorUsersTable.lastFollowerCrawl} IS NULL OR ${anchorUsersTable.lastFollowerCrawl} < ${cutoffTime}`,
    )
    .orderBy(sql`${anchorUsersTable.lastFollowerCrawl} ASC NULLS FIRST`)
    .limit(limit);

  return result.map((row) => ({
    did: row.did,
    handle: row.handle || "",
    lastFollowerCrawl: row.lastFollowerCrawl || undefined,
  }));
}

// Cron job function for processing followers from queue
export function processFollowersFromQueue() {
  console.log(
    "⚠️ processFollowersFromQueue called but no queue processing logic implemented",
  );
  console.log(
    "This would typically process a backlog of users needing follow sync",
  );

  return {
    processedUsers: 0,
    totalFollows: 0,
    errors: 0,
    message:
      "No follower queue processing implemented - followers are processed via direct crawler",
  };
}
