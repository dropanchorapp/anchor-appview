// OAuth session management utilities
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";
import type { OAuthSession } from "./types.ts";

// Initialize OAuth tables
export async function initializeOAuthTables() {
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      pds_url TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      dpop_private_key TEXT NOT NULL,  -- JWK format
      dpop_public_key TEXT NOT NULL,   -- JWK format
      session_id TEXT UNIQUE,          -- Session cookie ID
      display_name TEXT,               -- User's display name
      avatar_url TEXT,                 -- User's avatar URL
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await sqlite.execute(`
    CREATE INDEX IF NOT EXISTS idx_oauth_sessions_updated ON oauth_sessions(updated_at DESC)
  `);

  // Add session_id column if it doesn't exist (migration)
  try {
    await sqlite.execute(`
      ALTER TABLE oauth_sessions ADD COLUMN session_id TEXT
    `);
    console.log("Added session_id column to oauth_sessions table");
  } catch (error) {
    // Column probably already exists, ignore the error
    const errorMsg = error.message || String(error);
    if (
      errorMsg.includes("duplicate column name") ||
      errorMsg.includes("already exists")
    ) {
      console.log("session_id column already exists");
    } else {
      console.error("Error adding session_id column:", errorMsg);
    }
  }

  // Add profile columns if they don't exist (migration)
  try {
    await sqlite.execute(`
      ALTER TABLE oauth_sessions ADD COLUMN display_name TEXT
    `);
    console.log("Added display_name column to oauth_sessions table");
  } catch (error) {
    const errorMsg = error.message || String(error);
    if (
      !errorMsg.includes("duplicate column name") &&
      !errorMsg.includes("already exists")
    ) {
      console.error("Error adding display_name column:", errorMsg);
    }
  }

  try {
    await sqlite.execute(`
      ALTER TABLE oauth_sessions ADD COLUMN avatar_url TEXT
    `);
    console.log("Added avatar_url column to oauth_sessions table");
  } catch (error) {
    const errorMsg = error.message || String(error);
    if (
      !errorMsg.includes("duplicate column name") &&
      !errorMsg.includes("already exists")
    ) {
      console.error("Error adding avatar_url column:", errorMsg);
    }
  }

  // Check if session_id column exists before creating index
  try {
    // Test if the column exists by trying to query it
    await sqlite.execute(`SELECT session_id FROM oauth_sessions LIMIT 0`);

    // If we get here, the column exists, so create the index
    await sqlite.execute(`
      CREATE INDEX IF NOT EXISTS idx_oauth_sessions_session_id ON oauth_sessions(session_id)
    `);
    console.log("Created index for session_id column");
  } catch (error) {
    console.error(
      "session_id column does not exist, skipping index creation:",
      error.message,
    );
  }
}

// Store OAuth session in database
export async function storeOAuthSession(session: OAuthSession): Promise<void> {
  const now = Date.now();
  await sqlite.execute(
    `
    INSERT OR REPLACE INTO oauth_sessions 
    (did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      session.did,
      session.handle,
      session.pdsUrl,
      session.accessToken,
      session.refreshToken,
      session.dpopPrivateKey,
      session.dpopPublicKey,
      now,
      now,
    ],
  );
}

// Get stored OAuth session by DID
export async function getStoredSession(
  did: string,
): Promise<OAuthSession | null> {
  const result = await sqlite.execute(
    `
    SELECT * FROM oauth_sessions WHERE did = ?
  `,
    [did],
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    did: row.did as string,
    handle: row.handle as string,
    pdsUrl: row.pds_url as string,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    dpopPrivateKey: row.dpop_private_key as string,
    dpopPublicKey: row.dpop_public_key as string,
  };
}

// Get stored OAuth session by session ID
export async function getSessionBySessionId(
  sessionId: string,
): Promise<OAuthSession | null> {
  const result = await sqlite.execute(
    `
    SELECT * FROM oauth_sessions WHERE session_id = ?
  `,
    [sessionId],
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    did: row.did as string,
    handle: row.handle as string,
    pdsUrl: row.pds_url as string,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    dpopPrivateKey: row.dpop_private_key as string,
    dpopPublicKey: row.dpop_public_key as string,
  };
}

// Update OAuth session tokens
export async function updateSessionTokens(
  did: string,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const now = Date.now();
  await sqlite.execute(
    `
    UPDATE oauth_sessions
    SET access_token = ?, refresh_token = ?, updated_at = ?
    WHERE did = ?
  `,
    [accessToken, refreshToken, now, did],
  );
}

// Delete OAuth session
export async function deleteOAuthSession(did: string): Promise<void> {
  await sqlite.execute(
    `
    DELETE FROM oauth_sessions WHERE did = ?
  `,
    [did],
  );
}

// Get all active sessions (for cleanup)
export async function getActiveSessions(): Promise<OAuthSession[]> {
  const result = await sqlite.execute(`
    SELECT * FROM oauth_sessions ORDER BY updated_at DESC
  `);

  if (!result.rows) {
    return [];
  }

  return result.rows.map((row) => ({
    did: row.did as string,
    handle: row.handle as string,
    pdsUrl: row.pds_url as string,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    dpopPrivateKey: row.dpop_private_key as string,
    dpopPublicKey: row.dpop_public_key as string,
  }));
}

// Clean up expired sessions (older than 30 days)
export async function cleanupExpiredSessions(): Promise<number> {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const result = await sqlite.execute(
    `
    DELETE FROM oauth_sessions WHERE updated_at < ?
  `,
    [thirtyDaysAgo],
  );

  return (result as any).changes || 0;
}
