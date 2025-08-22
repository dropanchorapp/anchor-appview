// OAuth session cleanup utilities for production security
import { sqlite } from "https://esm.town/v/std/sqlite2";

/**
 * Cleanup expired or failed OAuth sessions to prevent database bloat
 * and reduce security exposure from stale session data
 */
export async function cleanupExpiredOAuthSessions(): Promise<number> {
  const now = Date.now();

  // Clean up sessions that are:
  // 1. Pending (WEB_PENDING/PENDING) and older than 10 minutes
  // 2. Failed sessions older than 1 hour
  // 3. Expired tokens older than 7 days

  const result = await sqlite.execute({
    sql: `DELETE FROM oauth_sessions 
          WHERE 
            (access_token IN ('WEB_PENDING', 'PENDING') AND created_at < ?) OR
            (token_expires_at > 0 AND token_expires_at < ? AND updated_at < ?)`,
    args: [
      now - (10 * 60 * 1000), // 10 minutes ago for pending sessions
      now, // Current time for expired tokens
      now - (7 * 24 * 60 * 60 * 1000), // 7 days ago for old expired sessions
    ],
  });

  const deletedCount = result.rowsAffected || 0;

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} expired OAuth sessions`);
  }

  return deletedCount;
}

/**
 * Get count of OAuth sessions by status for monitoring
 */
export async function getOAuthSessionStats(): Promise<{
  pending: number;
  webPending: number;
  active: number;
  expired: number;
}> {
  const now = Date.now();

  const result = await sqlite.execute({
    sql: `SELECT 
            COUNT(CASE WHEN access_token = 'PENDING' THEN 1 END) as pending,
            COUNT(CASE WHEN access_token = 'WEB_PENDING' THEN 1 END) as web_pending,
            COUNT(CASE WHEN access_token NOT IN ('PENDING', 'WEB_PENDING') AND (token_expires_at = 0 OR token_expires_at > ?) THEN 1 END) as active,
            COUNT(CASE WHEN token_expires_at > 0 AND token_expires_at <= ? THEN 1 END) as expired
          FROM oauth_sessions`,
    args: [now, now],
  });

  const row = result.rows?.[0];
  return {
    pending: (row?.pending as number) || 0,
    webPending: (row?.web_pending as number) || 0,
    active: (row?.active as number) || 0,
    expired: (row?.expired as number) || 0,
  };
}
