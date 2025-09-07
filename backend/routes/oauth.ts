// OAuth authentication routes
import { Hono } from "jsr:@hono/hono@4.9.6";
import { OAuthClient } from "jsr:@tijs/oauth-client-deno@1.0.5";
import { HonoOAuthSessions } from "jsr:@tijs/hono-oauth-sessions@0.2.3";
import { valTownStorage } from "../oauth/iron-storage.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

// Create OAuth client and sessions manager
const oauthClient = new OAuthClient({
  clientId: `${BASE_URL}/client-metadata.json`,
  redirectUri: `${BASE_URL}/oauth/callback`,
  storage: valTownStorage,
});

const sessions = new HonoOAuthSessions({
  oauthClient,
  storage: valTownStorage,
  cookieSecret: COOKIE_SECRET,
  baseUrl: BASE_URL,
  mobileScheme: "anchor-app://auth-callback",
});

// Export sessions instance for clean API access
export { sessions };

export function createOAuthRoutes() {
  const app = new Hono();

  // OAuth client metadata
  app.get("/client-metadata.json", (c) => {
    return c.json({
      client_name: "Anchor Location Feed",
      client_id: `${BASE_URL}/client-metadata.json`,
      client_uri: BASE_URL,
      redirect_uris: [`${BASE_URL}/oauth/callback`],
      scope: "atproto transition:generic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "none",
      dpop_bound_access_tokens: true,
      logo_uri: `${BASE_URL}/static/anchor-logo-transparent.png`,
      policy_uri: `${BASE_URL}/privacy-policy`,
    });
  });

  // Start OAuth flow (web)
  app.get("/login", async (c) => {
    const { handle } = c.req.query();

    if (typeof handle !== "string") {
      return c.text("Invalid handle", 400);
    }

    try {
      const authUrl = await sessions.startOAuth(handle);
      return c.redirect(authUrl);
    } catch (err) {
      console.error("OAuth authorize failed:", err);
      return c.text(
        err instanceof Error ? err.message : "Couldn't initiate login",
        400,
      );
    }
  });

  // OAuth callback
  app.get("/oauth/callback", async (c) => {
    try {
      return await sessions.handleCallback(c);
    } catch (err) {
      console.error("OAuth callback failed:", err);
      return c.text(`Login failed: ${(err as Error).message}`, 400);
    }
  });

  // Mobile OAuth start
  app.post("/api/auth/mobile-start", async (c) => {
    try {
      const body = await c.req.json();
      const { handle, code_challenge } = body;

      if (typeof handle !== "string") {
        return c.json({ error: "Invalid handle" }, 400);
      }

      if (typeof code_challenge !== "string") {
        return c.json({ error: "Missing code_challenge" }, 400);
      }

      console.log(`Starting mobile OAuth authorize for handle: ${handle}`);

      const authUrl = await sessions.startOAuth(handle, {
        mobile: true,
        codeChallenge: code_challenge,
      });

      console.log(`Generated mobile authorization URL: ${authUrl}`);

      return c.json({
        success: true,
        authUrl: authUrl,
      });
    } catch (err) {
      console.error("Mobile OAuth start failed:", err);
      return c.json({
        error: err instanceof Error ? err.message : "Couldn't initiate login",
      }, 400);
    }
  });

  // Mobile token refresh
  app.get("/mobile/refresh-token", async (c) => {
    try {
      const authHeader = c.req.header("Authorization");
      if (!authHeader) {
        return c.json(
          { success: false, error: "Missing Authorization header" },
          401,
        );
      }

      const result = await sessions.refreshMobileToken(authHeader);
      return c.json(result);
    } catch (err) {
      console.error("Token refresh failed:", err);
      return c.json({ success: false, error: "Token refresh failed" }, 500);
    }
  });

  // Session validation
  app.get("/validate-session", async (c) => {
    try {
      const result = await sessions.validateSession(c);
      if (result.valid) {
        return c.json({
          valid: true,
          did: result.did,
          handle: result.handle,
        });
      } else {
        return c.json({ valid: false }, 401);
      }
    } catch (err) {
      console.error("Session validation failed:", err);
      return c.json({ valid: false }, 401);
    }
  });

  // Session validation for API (extended)
  app.get("/api/auth/session", async (c) => {
    try {
      let result;

      // Check if request has Authorization header (mobile) or uses cookies (web)
      const authHeader = c.req.header("Authorization");

      if (authHeader && authHeader.startsWith("Bearer ")) {
        // Mobile client with Bearer token
        console.log("Using mobile session validation for Bearer token");
        result = await sessions.validateMobileSession(authHeader);
      } else {
        // Web client with cookies
        console.log("Using cookie-based session validation");
        result = await sessions.validateSession(c);
      }

      if (!result.valid || !result.did) {
        return c.json({ valid: false }, 401);
      }

      // Get additional OAuth session data for API access
      const oauthData = await sessions.getStoredOAuthData(result.did);
      if (!oauthData) {
        return c.json({ valid: false }, 401);
      }

      return c.json({
        valid: true,
        did: result.did,
        handle: result.handle || oauthData.handle,
        userHandle: result.handle || oauthData.handle, // Add userHandle for mobile client compatibility
        displayName: result.displayName || oauthData.displayName,
        avatar: oauthData.avatar,
        accessToken: oauthData.accessToken,
        refreshToken: oauthData.refreshToken,
        expiresAt: oauthData.expiresAt,
      });
    } catch (err) {
      console.error("Session validation failed:", err);
      return c.json({ valid: false }, 401);
    }
  });

  // Logout
  app.post("/api/auth/logout", async (c) => {
    try {
      await sessions.logout(c);
      return c.json({ success: true });
    } catch (err) {
      console.error("Logout failed:", err);
      return c.json({ success: false, error: "Logout failed" }, 500);
    }
  });

  return app;
}
