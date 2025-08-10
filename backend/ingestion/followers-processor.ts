// Followers processor - handles syncing following relationships to database
import { db } from "../database/db.ts";

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
    // Get existing follows from database
    const existingResult = await db.execute(
      `SELECT following_did FROM user_follows WHERE follower_did = ?`,
      [userDid],
    );

    const existingFollows = new Set(
      existingResult.rows?.map((row) => row.following_did as string) || [],
    );

    const newFollows = new Set(follows.map((f) => f.did));

    // Calculate changes
    const toAdd = follows.filter((follow) => !existingFollows.has(follow.did));
    const toRemove = Array.from(existingFollows).filter((did) =>
      !newFollows.has(did)
    );

    // Remove unfollows (without transaction for Val Town compatibility)
    if (toRemove.length > 0) {
      // Process in smaller batches to avoid query limits
      const batchSize = 50;
      for (let i = 0; i < toRemove.length; i += batchSize) {
        const batch = toRemove.slice(i, i + batchSize);
        const placeholders = batch.map(() => "?").join(",");
        await db.execute(
          `DELETE FROM user_follows WHERE follower_did = ? AND following_did IN (${placeholders})`,
          [userDid, ...batch],
        );
      }
      console.log(`🗑️ Removed ${toRemove.length} unfollows for ${userDid}`);
    }

    // Add new follows in batches (without transaction for Val Town compatibility)
    if (toAdd.length > 0) {
      const batchSize = 50; // Smaller batches for Val Town
      let inserted = 0;

      for (let i = 0; i < toAdd.length; i += batchSize) {
        const batch = toAdd.slice(i, i + batchSize);

        // Prepare batch insert
        const values = batch.map(() => "(?, ?, ?, CURRENT_TIMESTAMP)").join(
          ", ",
        );
        const params: string[] = [];

        for (const follow of batch) {
          params.push(userDid, follow.did, follow.createdAt);
        }

        const query = `
          INSERT OR IGNORE INTO user_follows (follower_did, following_did, created_at, synced_at)
          VALUES ${values}
        `;

        try {
          await db.execute(query, params);
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
    db.execute("SELECT COUNT(*) as count FROM user_follows"),
    db.execute(
      "SELECT COUNT(DISTINCT follower_did) as count FROM user_follows",
    ),
    db.execute(`
      SELECT follower_did, synced_at 
      FROM user_follows 
      ORDER BY synced_at DESC 
      LIMIT 1
    `),
  ]);

  const totalFollowRelationships = totalResult.rows?.[0]?.count || 0;
  const usersWithFollows = usersResult.rows?.[0]?.count || 0;
  const averageFollowsPerUser = usersWithFollows > 0
    ? Math.round(totalFollowRelationships / usersWithFollows)
    : 0;

  return {
    totalFollowRelationships,
    usersWithFollows,
    averageFollowsPerUser,
    lastSyncedUser: lastSyncResult.rows?.[0]?.follower_did,
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

  const result = await db.execute(
    `
    SELECT did, handle, last_follower_crawl
    FROM anchor_users
    WHERE last_follower_crawl IS NULL 
       OR last_follower_crawl < ?
    ORDER BY last_follower_crawl ASC NULLS FIRST
    LIMIT ?
    `,
    [cutoffTime, limit],
  );

  return result.rows?.map((row) => ({
    did: row.did as string,
    handle: row.handle as string,
    lastFollowerCrawl: row.last_follower_crawl as string | undefined,
  })) || [];
}
