// OAuth session management utilities
import { sqlite } from "https://esm.town/v/std/sqlite2";
import type { OAuthSession } from "./types.ts";

// OAuth table initialization is now handled by Drizzle migrations in /backend/database/migrations.ts
// This eliminates duplicate table creation and ensures schema consistency

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

// Removed getSessionBySessionId function - use the Drizzle ORM version in database/queries.ts instead

// Removed updateSessionTokens function - not used anywhere in the codebase

// Touch session to update the updated_at timestamp (keeps session alive)
export async function touchSession(did: string): Promise<void> {
  const now = Date.now();
  await sqlite.execute({
    sql: `UPDATE oauth_sessions SET updated_at = ? WHERE did = ?`,
    args: [now, did],
  });
}

// Removed deleteOAuthSession function - use the Drizzle ORM version in database/queries.ts instead

// Removed getActiveSessions function - not used anywhere in the codebase

// Removed cleanupExpiredSessions function - not used anywhere in the codebase
