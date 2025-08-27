// Iron Session-based OAuth routes for Hono on Val.town
// Based on BookHive's auth/router.tsx but adapted for Val.town environment

import { Hono } from "https://esm.sh/hono";
import { getIronSession, sealData } from "npm:iron-session@8.0.4";
import { isValidHandle } from "npm:@atproto/syntax@0.4.0";
import { CustomOAuthClient } from "./custom-oauth-client.ts";
import { valTownStorage } from "./iron-storage.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

export interface Session {
  did: string;
}

export function createOAuthRouter() {
  const app = new Hono<{ Variables: { oauthClient: CustomOAuthClient } }>();
  let oauthClient: CustomOAuthClient | null = null;

  // Initialize OAuth client
  app.use("*", async (c, next) => {
    if (!oauthClient) {
      oauthClient = new CustomOAuthClient(valTownStorage);
    }
    c.set("oauthClient", oauthClient);
    await next();
  });

  // Client metadata endpoint
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
      dpop_bound_access_tokens: true, // Required by AT Protocol - we handle DPoP manually
      logo_uri: `${BASE_URL}/static/anchor-logo-transparent.png`,
      policy_uri: `${BASE_URL}/privacy-policy`,
    });
  });

  // Start OAuth flow (web and mobile)
  app.get("/login", async (c) => {
    const { handle } = c.req.query();

    if (typeof handle !== "string" || !isValidHandle(handle)) {
      return c.text("Invalid handle", 400);
    }

    try {
      // Use custom OAuth client (official library has crypto issues in Deno)
      console.log(`Starting OAuth authorize for handle: ${handle}`);
      const state = crypto.randomUUID();
      const url = await c.get("oauthClient").getAuthorizationUrl(handle, state);
      console.log(`Generated authorization URL: ${url}`);
      return c.redirect(url);
    } catch (err) {
      console.error("OAuth authorize failed:", err);
      return c.text(
        err instanceof Error ? err.message : "Couldn't initiate login",
        400,
      );
    }
  });

  // OAuth callback to complete session creation
  app.get("/oauth/callback", async (c) => {
    try {
      // Use custom OAuth client callback
      console.log(`Processing OAuth callback`);
      const params = new URLSearchParams(c.req.url.split("?")[1]);
      const oauthSession = await c.get("oauthClient").handleCallback(params);

      console.log(`OAuth callback successful for DID: ${oauthSession.did}`);

      const clientSession = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
        // Set session TTL to 24 hours, independent of token expiration
        ttl: 60 * 60 * 24,
      });

      clientSession.did = oauthSession.did;
      await clientSession.save();

      // Store OAuth session in our storage for later use
      await valTownStorage.set(
        `oauth_session:${oauthSession.did}`,
        oauthSession,
      );

      // For now, redirect to home - mobile redirects will be handled separately
      // TODO: Implement mobile redirect handling

      return c.redirect("/");
    } catch (err) {
      console.error("OAuth callback failed:", err);
      return c.text(`Login failed: ${(err as Error).message}`, 400);
    }
  });

  // Mobile login endpoint
  app.get("/mobile/login", async (c) => {
    const { handle, redirect_uri: redirectUri } = c.req.query();

    if (typeof handle !== "string" || !isValidHandle(handle)) {
      return c.text("Invalid handle", 400);
    }

    if (typeof redirectUri !== "string") {
      return c.text("redirect_uri is required for mobile login", 400);
    }

    try {
      // Validate redirect URI
      const redirectUrl = new URL(redirectUri);
      if (redirectUrl.protocol !== "anchor-app:") {
        return c.text("Invalid redirect_uri - must use anchor-app scheme", 400);
      }
    } catch {
      return c.text("Invalid redirect_uri format", 400);
    }

    try {
      // Use custom OAuth client with mobile redirect
      console.log(`Starting mobile OAuth authorize for handle: ${handle}`);
      const state = JSON.stringify({ redirectUri, handle });
      const url = await c.get("oauthClient").getAuthorizationUrl(handle, state);
      console.log(`Generated mobile authorization URL: ${url}`);
      return c.redirect(url);
    } catch (err) {
      console.error("OAuth authorize failed:", err);
      return c.text(
        err instanceof Error ? err.message : "Couldn't initiate login",
        400,
      );
    }
  });

  // Mobile token refresh endpoint
  app.get("/mobile/refresh-token", async (c) => {
    try {
      const session = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
      });

      if (!session.did) {
        return c.json({ success: false, error: "No session found" }, 401);
      }

      // TODO: Implement token refresh with our custom OAuth client
      // For now, just extend the session
      await session.save();

      return c.json({
        success: true,
        payload: {
          sid: await sealData({ did: session.did }, {
            password: COOKIE_SECRET,
          }),
          did: session.did,
        },
      });
    } catch (err) {
      console.error("Token refresh failed:", err);
      return c.json({ success: false, error: "Token refresh failed" }, 500);
    }
  });

  // Logout handler
  app.post("/logout", async (c) => {
    const session = await getIronSession<Session>(c.req.raw, c.res, {
      cookieName: "sid",
      password: COOKIE_SECRET,
    });

    if (session.did) {
      // TODO: Implement session revocation
      // For now, just clean up local storage
      try {
        await valTownStorage.del(`oauth_session:${session.did}`);
      } catch (err) {
        console.error("Error cleaning up session:", err);
      }
    }

    await session.destroy();
    return c.redirect("/");
  });

  // Session validation endpoint (for API authentication)
  app.get("/validate-session", async (c) => {
    try {
      const session = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
      });

      if (!session.did) {
        return c.json({ valid: false }, 401);
      }

      // Check if we have OAuth session data
      const oauthSession = await valTownStorage.get(
        `oauth_session:${session.did}`,
      );
      if (!oauthSession) {
        return c.json({ valid: false }, 401);
      }

      return c.json({
        valid: true,
        did: session.did,
        handle: oauthSession.handle,
      });
    } catch (err) {
      console.error("Session validation failed:", err);
      return c.json({ valid: false }, 401);
    }
  });

  return app;
}
