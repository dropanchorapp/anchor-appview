// Authentication middleware for unified OAuth Bearer token validation
// Supports both httpOnly cookies (web) and Authorization headers (mobile)

import type { Context } from "https://esm.sh/hono";
import type { OAuthSession } from "../oauth/types.ts";

/**
 * Extract OAuth access token from request
 * Supports both httpOnly cookies (web) and Authorization headers (mobile)
 */
export async function extractAccessToken(c: Context): Promise<string | null> {
  // First try Authorization header (mobile apps)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fall back to httpOnly cookie (web browsers)
  const sessionCookie = c.req.header("cookie");
  const anchorSession = sessionCookie
    ?.split(";")
    .find((cookie) => cookie.trim().startsWith("anchor_session="))
    ?.split("=")[1];

  if (!anchorSession) {
    return null;
  }

  // Look up the OAuth session by session ID to get access token
  const { sqlite } = await import("https://esm.town/v/std/sqlite2");
  const result = await sqlite.execute({
    sql: `SELECT access_token FROM oauth_sessions WHERE session_id = ?`,
    args: [anchorSession],
  });

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  return result.rows[0][0] as string;
}

/**
 * Authenticate OAuth Bearer token and return session information
 * Unified authentication for both web (cookies) and mobile (headers)
 */
export async function authenticateRequest(
  c: Context,
): Promise<{ session: OAuthSession; accessToken: string } | null> {
  const accessToken = await extractAccessToken(c);

  if (!accessToken) {
    return null;
  }

  // Validate token format (should be a JWT)
  const tokenParts = accessToken.split(".");
  if (tokenParts.length !== 3) {
    return null;
  }

  // Find the session associated with this access token
  const { sqlite } = await import("https://esm.town/v/std/sqlite2");
  const result = await sqlite.execute({
    sql:
      `SELECT did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, token_expires_at FROM oauth_sessions WHERE access_token = ?`,
    args: [accessToken],
  });

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  // Convert row to object with explicit column mapping
  const sessionRow = result.rows[0];
  const session: OAuthSession = {
    did: sessionRow[0] as string,
    handle: sessionRow[1] as string,
    pdsUrl: sessionRow[2] as string,
    accessToken: sessionRow[3] as string,
    refreshToken: sessionRow[4] as string,
    dpopPrivateKey: sessionRow[5] as string,
    dpopPublicKey: sessionRow[6] as string,
    tokenExpiresAt: sessionRow[7] as number,
  };

  // Check if token is expired
  if (Date.now() > session.tokenExpiresAt) {
    return null;
  }

  return { session, accessToken };
}

/**
 * Authentication middleware for Hono routes
 * Adds authenticated session to context if valid
 */
export async function authMiddleware(
  c: Context,
  next: () => Promise<void>,
): Promise<void> {
  const authResult = await authenticateRequest(c);

  if (authResult) {
    // Add session to context for use in route handlers
    c.set("auth", authResult);
  }

  await next();
}

/**
 * Require authentication middleware
 * Returns 401 if no valid authentication found
 */
export async function requireAuth(
  c: Context,
  next: () => Promise<void>,
): Promise<Response | void> {
  const authResult = await authenticateRequest(c);

  if (!authResult) {
    return c.json({
      success: false,
      error: "Authentication required. Please log in.",
    }, 401);
  }

  // Add session to context
  c.set("auth", authResult);
  await next();
}
