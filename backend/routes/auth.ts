/**
 * Auth routes - combines OAuth library handlers with app-specific endpoints
 */

import { Hono } from "jsr:@hono/hono@4.9.6";
import { isValidHandle } from "npm:@atproto/syntax@0.3.0";
import { oauth } from "./oauth.ts";
import { getSessionFromRequest } from "../utils/session.ts";
import { migrateUserCheckinsInBackground } from "../services/checkin-migration-service.ts";

const app = new Hono();

// === Core OAuth routes (from library) ===

app.get("/login", (c) => oauth.handleLogin(c.req.raw));
app.get("/oauth/callback", (c) => oauth.handleCallback(c.req.raw));
app.get("/oauth-client-metadata.json", () => oauth.handleClientMetadata());
app.post("/api/auth/logout", (c) => oauth.handleLogout(c.req.raw));

// === App-specific session endpoint ===

/**
 * Session endpoint supporting both web (cookies) and mobile (Bearer tokens)
 */
app.get("/api/auth/session", async (c) => {
  // Use the wrapper that handles both cookie and Bearer auth
  const result = await getSessionFromRequest(c.req.raw);

  if (!result.session) {
    const errorResponse = c.json({
      valid: false,
      error: result.error?.message || "Not authenticated",
      reason: result.error?.type || "unknown",
    }, 401);

    return errorResponse;
  }

  // Trigger background migration for old format checkins (non-blocking)
  // This converts addressRef + coordinates to embedded address + geo
  migrateUserCheckinsInBackground({
    did: result.session.did,
    pdsUrl: result.session.pdsUrl,
    makeRequest: result.session.makeRequest.bind(result.session),
  });

  // Return session info with tokens for mobile compatibility
  const response = c.json({
    valid: true,
    did: result.session.did,
    handle: result.session.handle,
    userHandle: result.session.handle, // Mobile client compatibility
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
  });

  // Set refreshed cookie for web clients
  if (result.setCookieHeader) {
    response.headers.set("Set-Cookie", result.setCookieHeader);
  }

  return response;
});

// === Mobile OAuth endpoints ===

interface MobileStartRequest {
  handle: string;
  code_challenge: string;
}

/**
 * Start mobile OAuth flow with PKCE
 *
 * Mobile clients call this to get an authorization URL, then open that URL
 * in a web view. The callback will redirect to the mobile scheme with tokens.
 */
app.post("/api/auth/mobile-start", async (c) => {
  try {
    const body: MobileStartRequest = await c.req.json();
    const { handle, code_challenge } = body;

    if (!handle || typeof handle !== "string") {
      return c.json({ success: false, error: "Invalid handle" }, 400);
    }

    if (!isValidHandle(handle)) {
      return c.json({ success: false, error: "Invalid handle format" }, 400);
    }

    if (!code_challenge || typeof code_challenge !== "string") {
      return c.json({ success: false, error: "Missing code_challenge" }, 400);
    }

    console.log(`Starting mobile OAuth for handle: ${handle}`);

    // Build login URL with mobile=true to trigger mobile callback flow
    const loginUrl = new URL("/login", c.req.url);
    loginUrl.searchParams.set("handle", handle);
    loginUrl.searchParams.set("mobile", "true");

    const authUrl = loginUrl.toString();

    console.log(`Mobile auth URL generated: ${authUrl}`);

    return c.json({
      success: true,
      authUrl,
    });
  } catch (err) {
    console.error("Mobile OAuth start failed:", err);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Couldn't initiate login",
      },
      400,
    );
  }
});

/**
 * Validate session endpoint (legacy compatibility)
 */
app.get("/validate-session", async (c) => {
  const result = await getSessionFromRequest(c.req.raw);

  if (!result.session) {
    return c.json({ valid: false }, 401);
  }

  const response = c.json({
    valid: true,
    did: result.session.did,
    handle: result.session.handle,
  });

  if (result.setCookieHeader) {
    response.headers.set("Set-Cookie", result.setCookieHeader);
  }

  return response;
});

/**
 * Mobile token refresh endpoint
 *
 * Mobile clients call this to get fresh tokens when needed.
 * The underlying OAuth session restoration handles token refresh automatically.
 */
app.get("/mobile/refresh-token", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json(
        { success: false, error: "Missing Authorization header" },
        401,
      );
    }

    // Use the session wrapper which handles both cookie and Bearer tokens
    const result = await getSessionFromRequest(c.req.raw);

    if (!result.session) {
      return c.json(
        { success: false, error: result.error?.message || "Session not found" },
        401,
      );
    }

    // Session restoration already handles token refresh internally
    return c.json({
      success: true,
      did: result.session.did,
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
    });
  } catch (err) {
    console.error("Token refresh failed:", err);
    return c.json({ success: false, error: "Token refresh failed" }, 500);
  }
});

export { app as authRoutes };
