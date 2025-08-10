// User and PDS tracking for privacy-focused crawling
import { db } from "./db.ts";

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

// Initialize user tracking tables
export async function initializeUserTables(): Promise<void> {
  console.log("Initializing user tracking tables...");

  // Create anchor_users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS anchor_users (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      pds_url TEXT NOT NULL,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_crawled_at TIMESTAMP,
      last_follower_crawl TIMESTAMP
    )
  `);

  // Create user_pdses table for reference counting
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_pdses (
      pds_url TEXT PRIMARY KEY,
      user_count INTEGER DEFAULT 1,
      last_crawled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for efficient querying
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_anchor_users_pds_url ON anchor_users(pds_url)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_anchor_users_last_crawled ON anchor_users(last_crawled_at)
  `);

  console.log("User tracking tables initialized");
}

// Register a new user (called during OAuth)
export async function registerUser(
  did: string,
  handle: string,
  pdsUrl: string,
): Promise<void> {
  console.log(`📝 Registering user ${handle} (${did}) on PDS ${pdsUrl}`);

  // Start transaction for atomic operation
  await db.execute("BEGIN");

  try {
    // Insert or update user
    await db.execute(
      `
      INSERT INTO anchor_users (did, handle, pds_url, registered_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(did) DO UPDATE SET
        handle = excluded.handle,
        pds_url = excluded.pds_url,
        registered_at = excluded.registered_at
      `,
      [did, handle, pdsUrl],
    );

    // Update PDS reference count
    await db.execute(
      `
      INSERT INTO user_pdses (pds_url, user_count, created_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(pds_url) DO UPDATE SET
        user_count = user_count + 1
      `,
      [pdsUrl],
    );

    await db.execute("COMMIT");
    console.log(`✅ Successfully registered user ${handle}`);
  } catch (error) {
    try {
      await db.execute("ROLLBACK");
    } catch (rollbackError) {
      console.warn(
        `⚠️ Rollback failed (transaction may have already ended):`,
        rollbackError,
      );
    }
    console.error(`❌ Failed to register user ${handle}:`, error);
    throw error;
  }
}

// Remove a user and clean up unused PDSs
export async function removeUser(did: string): Promise<void> {
  console.log(`🗑️ Removing user ${did}`);

  // Start transaction for atomic cleanup
  await db.execute("BEGIN");

  try {
    // Get user's PDS before deletion
    const userResult = await db.execute(
      "SELECT pds_url FROM anchor_users WHERE did = ?",
      [did],
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      console.log(`User ${did} not found, nothing to remove`);
      try {
        await db.execute("ROLLBACK");
      } catch (rollbackError) {
        console.warn(
          `⚠️ Rollback failed (transaction may have already ended):`,
          rollbackError,
        );
      }
      return;
    }

    const pdsUrl = userResult.rows[0].pds_url as string;

    // Remove user
    await db.execute("DELETE FROM anchor_users WHERE did = ?", [did]);

    // Decrease PDS reference count
    await db.execute(
      "UPDATE user_pdses SET user_count = user_count - 1 WHERE pds_url = ?",
      [pdsUrl],
    );

    // Remove PDS if no users left
    await db.execute(
      "DELETE FROM user_pdses WHERE pds_url = ? AND user_count <= 0",
      [pdsUrl],
    );

    await db.execute("COMMIT");
    console.log(
      `✅ Successfully removed user ${did} and cleaned up PDS ${pdsUrl}`,
    );
  } catch (error) {
    try {
      await db.execute("ROLLBACK");
    } catch (rollbackError) {
      console.warn(
        `⚠️ Rollback failed (transaction may have already ended):`,
        rollbackError,
      );
    }
    console.error(`❌ Failed to remove user ${did}:`, error);
    throw error;
  }
}

// Get all registered users for crawling
export async function getRegisteredUsers(): Promise<AnchorUser[]> {
  const result = await db.execute(`
    SELECT did, handle, pds_url, registered_at, last_crawled_at
    FROM anchor_users
    ORDER BY last_crawled_at ASC NULLS FIRST
  `);

  if (!result.rows) return [];

  return result.rows.map((row) => ({
    did: row.did as string,
    handle: row.handle as string,
    pdsUrl: row.pds_url as string,
    registeredAt: row.registered_at as string,
    lastCrawledAt: row.last_crawled_at as string || undefined,
  }));
}

// Get all monitored PDS servers
export async function getMonitoredPDSes(): Promise<UserPDS[]> {
  const result = await db.execute(`
    SELECT pds_url, user_count, last_crawled_at, created_at
    FROM user_pdses
    WHERE user_count > 0
    ORDER BY last_crawled_at ASC NULLS FIRST
  `);

  if (!result.rows) return [];

  return result.rows.map((row) => ({
    pdsUrl: row.pds_url as string,
    userCount: row.user_count as number,
    lastCrawledAt: row.last_crawled_at as string || undefined,
    createdAt: row.created_at as string,
  }));
}

// Update user's last crawled timestamp
export async function updateUserLastCrawled(did: string): Promise<void> {
  await db.execute(
    "UPDATE anchor_users SET last_crawled_at = CURRENT_TIMESTAMP WHERE did = ?",
    [did],
  );
}

// Update user's last follower crawl timestamp
export async function updateUserLastFollowerCrawl(did: string): Promise<void> {
  await db.execute(
    "UPDATE anchor_users SET last_follower_crawl = CURRENT_TIMESTAMP WHERE did = ?",
    [did],
  );
}

// Update PDS last crawled timestamp
export async function updatePDSLastCrawled(pdsUrl: string): Promise<void> {
  await db.execute(
    "UPDATE user_pdses SET last_crawled_at = CURRENT_TIMESTAMP WHERE pds_url = ?",
    [pdsUrl],
  );
}

// Get user statistics
export async function getUserStats(): Promise<{
  totalUsers: number;
  totalPDSes: number;
  recentlyActive: number;
}> {
  const usersResult = await db.execute(
    "SELECT COUNT(*) as count FROM anchor_users",
  );
  const pdsResult = await db.execute(
    "SELECT COUNT(*) as count FROM user_pdses WHERE user_count > 0",
  );
  const activeResult = await db.execute(`
    SELECT COUNT(*) as count FROM anchor_users 
    WHERE last_crawled_at > datetime('now', '-1 hour')
  `);

  return {
    totalUsers: (usersResult.rows?.[0]?.count as number) || 0,
    totalPDSes: (pdsResult.rows?.[0]?.count as number) || 0,
    recentlyActive: (activeResult.rows?.[0]?.count as number) || 0,
  };
}

// Get migration statistics - check existing data that could be migrated
export async function getMigrationStats(): Promise<{
  oauthSessions: number;
  uniqueCheckinAuthors: number;
  cachedProfiles: number;
  currentlyTracked: number;
}> {
  const oauthResult = await db.execute(
    "SELECT COUNT(*) as count FROM oauth_sessions WHERE did IS NOT NULL AND handle IS NOT NULL AND pds_url IS NOT NULL",
  );

  const authorsResult = await db.execute(
    "SELECT COUNT(DISTINCT author_did) as count FROM checkins WHERE author_did IS NOT NULL AND author_handle IS NOT NULL",
  );

  const profilesResult = await db.execute(
    "SELECT COUNT(*) as count FROM profile_cache WHERE did IS NOT NULL AND handle IS NOT NULL",
  );

  const trackedResult = await db.execute(
    "SELECT COUNT(*) as count FROM anchor_users",
  );

  return {
    oauthSessions: (oauthResult.rows?.[0]?.count as number) || 0,
    uniqueCheckinAuthors: (authorsResult.rows?.[0]?.count as number) || 0,
    cachedProfiles: (profilesResult.rows?.[0]?.count as number) || 0,
    currentlyTracked: (trackedResult.rows?.[0]?.count as number) || 0,
  };
}
