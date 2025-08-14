// OAuth session management utilities
import { sqlite } from "https://esm.town/v/std/sqlite2";
import type { OAuthSession } from "./types.ts";

// Initialize OAuth tables
export async function initializeOAuthTables() {
  await sqlite.execute({
    sql: `CREATE TABLE IF NOT EXISTS oauth_sessions (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      pds_url TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      dpop_private_key TEXT NOT NULL,
      dpop_public_key TEXT NOT NULL,
      token_expires_at INTEGER NOT NULL,
      session_id TEXT UNIQUE,
      display_name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    args: [],
  });

  await sqlite.execute({
    sql:
      `CREATE INDEX IF NOT EXISTS idx_oauth_sessions_updated ON oauth_sessions(updated_at DESC)`,
    args: [],
  });

  // Add session_id column if it doesn't exist (migration)
  try {
    await sqlite.execute({
      sql: `ALTER TABLE oauth_sessions ADD COLUMN session_id TEXT`,
      args: [],
    });
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

  // Add token_expires_at column if it doesn't exist (migration)
  try {
    await sqlite.execute({
      sql:
        `ALTER TABLE oauth_sessions ADD COLUMN token_expires_at INTEGER DEFAULT 0`,
      args: [],
    });
    console.log("Added token_expires_at column to oauth_sessions table");
  } catch (error) {
    // Column probably already exists, ignore the error
    const errorMsg = error.message || String(error);
    if (
      errorMsg.includes("duplicate column name") ||
      errorMsg.includes("already exists")
    ) {
      console.log("token_expires_at column already exists");
    } else {
      console.error("Error adding token_expires_at column:", errorMsg);
    }
  }

  // Add profile columns if they don't exist (migration)
  try {
    await sqlite.execute({
      sql: `ALTER TABLE oauth_sessions ADD COLUMN display_name TEXT`,
      args: [],
    });
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
    await sqlite.execute({
      sql: `ALTER TABLE oauth_sessions ADD COLUMN avatar_url TEXT`,
      args: [],
    });
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

  // Add token expiration column if it doesn't exist (migration)
  try {
    await sqlite.execute({
      sql: `ALTER TABLE oauth_sessions ADD COLUMN token_expires_at INTEGER`,
      args: [],
    });
    console.log("Added token_expires_at column to oauth_sessions table");
  } catch (error) {
    const errorMsg = error.message || String(error);
    if (
      !errorMsg.includes("duplicate column name") &&
      !errorMsg.includes("already exists")
    ) {
      console.error("Error adding token_expires_at column:", errorMsg);
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
  await sqlite.execute({
    sql: `INSERT OR REPLACE INTO oauth_sessions 
    (did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, token_expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      session.did,
      session.handle,
      session.pdsUrl,
      session.accessToken,
      session.refreshToken,
      session.dpopPrivateKey,
      session.dpopPublicKey,
      session.tokenExpiresAt,
      now,
      now,
    ],
  });
}

// Get stored OAuth session by DID
export async function getStoredSession(
  did: string,
): Promise<OAuthSession | null> {
  const result = await sqlite.execute({
    sql: `SELECT * FROM oauth_sessions WHERE did = ?`,
    args: [did],
  });

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
    tokenExpiresAt: (row.token_expires_at as number) || 0,
  };
}

// Get stored OAuth session by session ID
export async function getSessionBySessionId(
  sessionId: string,
): Promise<OAuthSession | null> {
  const result = await sqlite.execute({
    sql: `SELECT * FROM oauth_sessions WHERE session_id = ?`,
    args: [sessionId],
  });

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
    tokenExpiresAt: (row.token_expires_at as number) || 0,
  };
}

// Update OAuth session tokens
export async function updateSessionTokens(
  did: string,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const now = Date.now();
  await sqlite.execute({
    sql:
      `UPDATE oauth_sessions SET access_token = ?, refresh_token = ?, updated_at = ? WHERE did = ?`,
    args: [accessToken, refreshToken, now, did],
  });
}

// Touch session to update the updated_at timestamp (keeps session alive)
export async function touchSession(did: string): Promise<void> {
  const now = Date.now();
  await sqlite.execute({
    sql: `UPDATE oauth_sessions SET updated_at = ? WHERE did = ?`,
    args: [now, did],
  });
}

// Delete OAuth session
export async function deleteOAuthSession(did: string): Promise<void> {
  await sqlite.execute({
    sql: `DELETE FROM oauth_sessions WHERE did = ?`,
    args: [did],
  });
}

// Get all active sessions (for cleanup)
export async function getActiveSessions(): Promise<OAuthSession[]> {
  const result = await sqlite.execute({
    sql: `SELECT * FROM oauth_sessions ORDER BY updated_at DESC`,
    args: [],
  });

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
    tokenExpiresAt: (row.token_expires_at as number) || 0,
  }));
}

// Clean up expired sessions (older than 90 days - extended for mobile apps)
export async function cleanupExpiredSessions(): Promise<number> {
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const result = await sqlite.execute({
    sql: `DELETE FROM oauth_sessions WHERE updated_at < ?`,
    args: [ninetyDaysAgo],
  });

  return result.rowsAffected || 0;
}
