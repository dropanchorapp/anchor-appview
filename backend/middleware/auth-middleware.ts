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
    console.log("❌ No session found for session ID");
    return null;
  }

  const accessToken = result.rows[0].access_token as string;
  console.log(
    "✅ Found access token via session:",
    accessToken.substring(0, 20) + "...",
  );
  return accessToken;
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
    console.log("❌ No access token found");
    return null;
  }
  console.log(
    "🔍 Authenticating with token:",
    accessToken.substring(0, 20) + "...",
  );

  // Validate token format (should be a JWT)
  const tokenParts = accessToken.split(".");
  if (tokenParts.length !== 3) {
    console.log(
      "❌ Token format invalid - not a JWT:",
      tokenParts.length,
      "parts",
    );
    return null;
  }
  console.log("✅ Token format valid (3 parts)");

  // Find the session associated with this access token
  const { sqlite } = await import("https://esm.town/v/std/sqlite2");
  console.log("🔍 Looking up session by access token...");

  // Let's also check what sessions exist
  const allSessions = await sqlite.execute({
    sql: `SELECT did, handle, access_token FROM oauth_sessions LIMIT 3`,
    args: [],
  });
  console.log("📋 Available sessions:", allSessions.rows?.length || 0);

  const result = await sqlite.execute({
    sql:
      `SELECT did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, token_expires_at FROM oauth_sessions WHERE access_token = ?`,
    args: [accessToken],
  });

  if (!result.rows || result.rows.length === 0) {
    console.log("❌ No session found for access token - attempting refresh");

    // Try to refresh the token by extracting DID from JWT
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1]));
      const did = payload.sub; // Standard JWT 'sub' claim contains DID

      if (did) {
        console.log(
          "🔄 Attempting token refresh for DID:",
          did.substring(0, 20) + "...",
        );

        // Get session by DID
        const sessionResult = await sqlite.execute({
          sql: `SELECT * FROM oauth_sessions WHERE did = ?`,
          args: [did],
        });

        if (sessionResult.rows && sessionResult.rows.length > 0) {
          const sessionRow = sessionResult.rows[0];
          const sessionData = {
            did: sessionRow.did as string,
            handle: sessionRow.handle as string,
            pdsUrl: sessionRow.pds_url as string,
            accessToken: sessionRow.access_token as string,
            refreshToken: sessionRow.refresh_token as string,
            dpopPrivateKey: sessionRow.dpop_private_key as string,
            dpopPublicKey: sessionRow.dpop_public_key as string,
            tokenExpiresAt: sessionRow.token_expires_at as number,
          };

          // Attempt token refresh
          const { refreshOAuthToken } = await import("../oauth/dpop.ts");
          const refreshedSession = await refreshOAuthToken(sessionData);

          if (refreshedSession) {
            console.log("✅ Token refresh successful");
            return {
              session: refreshedSession,
              accessToken: refreshedSession.accessToken,
            };
          }
        }
      }
    } catch (refreshError) {
      console.log("❌ Token refresh failed:", refreshError.message);
    }

    return null;
  }
  console.log("✅ Found session for token");

  // Convert row to object using sqlite2 object properties
  const sessionRow = result.rows[0];
  const session: OAuthSession = {
    did: sessionRow.did as string,
    handle: sessionRow.handle as string,
    pdsUrl: sessionRow.pds_url as string,
    accessToken: sessionRow.access_token as string,
    refreshToken: sessionRow.refresh_token as string,
    dpopPrivateKey: sessionRow.dpop_private_key as string,
    dpopPublicKey: sessionRow.dpop_public_key as string,
    tokenExpiresAt: sessionRow.token_expires_at as number,
  };

  // Check if token is expired
  console.log(
    "🔍 Checking token expiration:",
    Date.now(),
    "vs",
    session.tokenExpiresAt,
  );
  if (Date.now() > session.tokenExpiresAt) {
    console.log("❌ Token expired!");
    return null;
  }
  console.log("✅ Token not expired");

  console.log("✅ Authentication successful");
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
