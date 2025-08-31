// Iron Session-based OAuth routes for Hono on Val.town
// Based on BookHive's auth/router.tsx but adapted for Val.town environment

import { Hono } from "https://esm.sh/hono";
import { getIronSession, sealData, unsealData } from "npm:iron-session@8.0.4";
import { isValidHandle } from "npm:@atproto/syntax@0.4.0";
import {
  OAuthClient,
  Session as OAuthSession,
} from "jsr:@tijs/oauth-client-deno@0.1.2";
import { valTownStorage } from "./iron-storage.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

export interface Session {
  did: string;
}

export function createOAuthRouter() {
  const app = new Hono<{ Variables: { oauthClient: OAuthClient } }>();
  let oauthClient: OAuthClient | null = null;

  // Initialize OAuth client
  app.use("*", async (c, next) => {
    if (!oauthClient) {
      oauthClient = new OAuthClient({
        clientId: `${BASE_URL}/client-metadata.json`,
        redirectUri: `${BASE_URL}/oauth/callback`,
        storage: valTownStorage,
      });
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
      // Use new OAuth client
      console.log(`Starting OAuth authorize for handle: ${handle}`);
      const state = crypto.randomUUID();
      const url = await c.get("oauthClient").authorize(handle, { state });
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

  // OAuth callback to complete result creation
  app.get("/oauth/callback", async (c) => {
    try {
      // Use new OAuth client callback
      console.log(`Processing OAuth callback`);
      const params = new URLSearchParams(c.req.url.split("?")[1]);
      const callbackParams = {
        code: params.get("code") || "",
        state: params.get("state") || "",
      };
      const callbackResult: any = await c.get("oauthClient").callback(
        callbackParams,
      );

      console.log(
        `OAuth callback successful for DID: ${callbackResult.session.did}`,
      );

      const clientSession = await getIronSession<{ did: string }>(
        c.req.raw,
        c.res,
        {
          cookieName: "sid",
          password: COOKIE_SECRET,
          // Set session TTL to 7 days with sliding expiration
          ttl: 60 * 60 * 24 * 7,
        },
      );

      clientSession.did = callbackResult.session.did;
      await clientSession.save();

      // Store OAuth session in our storage for later use
      await valTownStorage.set(
        `oauth_session:${callbackResult.session.did}`,
        callbackResult.session,
      );

      // Check if this is a mobile callback by parsing the state
      let state;
      try {
        const stateParam = params.get("state");
        state = stateParam ? JSON.parse(stateParam) : null;
      } catch {
        state = null;
      }

      // Handle mobile callback (from /api/auth/mobile-start)
      if (state && state.mobile === true) {
        console.log("Mobile OAuth callback detected");

        // Create sealed result token for mobile
        const sealedToken = await sealData(
          { did: callbackResult.session.did },
          {
            password: COOKIE_SECRET,
          },
        );

        // Create mobile callback URL with authentication data
        const mobileRedirectUrl = new URL("anchor-app://auth-callback");
        mobileRedirectUrl.searchParams.set("session_token", sealedToken);
        mobileRedirectUrl.searchParams.set("did", callbackResult.session.did);
        mobileRedirectUrl.searchParams.set(
          "handle",
          callbackResult.session.handle || state.handle,
        );

        // Add access token info if available
        if (callbackResult.session.accessToken) {
          mobileRedirectUrl.searchParams.set(
            "access_token",
            callbackResult.session.accessToken,
          );
        }
        if (callbackResult.session.refreshToken) {
          mobileRedirectUrl.searchParams.set(
            "refresh_token",
            callbackResult.session.refreshToken,
          );
        }

        console.log(
          `Redirecting mobile app to: ${mobileRedirectUrl.toString()}`,
        );
        return c.redirect(mobileRedirectUrl.toString());
      }

      // Web callback - set cookies and redirect to home
      return c.redirect("/");
    } catch (err) {
      console.error("OAuth callback failed:", err);
      return c.text(`Login failed: ${(err as Error).message}`, 400);
    }
  });

  // Mobile OAuth start endpoint (separate from web login)
  app.post("/api/auth/mobile-start", async (c) => {
    try {
      const body = await c.req.json();
      const { handle, code_challenge } = body;

      if (typeof handle !== "string" || !isValidHandle(handle)) {
        return c.json({ error: "Invalid handle" }, 400);
      }

      if (typeof code_challenge !== "string") {
        return c.json({ error: "Missing code_challenge" }, 400);
      }

      console.log(`Starting mobile OAuth authorize for handle: ${handle}`);

      // Create mobile-specific state with the code_challenge
      const state = JSON.stringify({
        mobile: true,
        code_challenge,
        handle,
      });

      const authUrl = await c.get("oauthClient").authorize(handle, { state });
      console.log(`Generated mobile authorization URL: ${authUrl}`);

      return c.json({
        success: true,
        authUrl,
      });
    } catch (err) {
      console.error("Mobile OAuth start failed:", err);
      return c.json({
        error: err instanceof Error ? err.message : "Couldn't initiate login",
      }, 400);
    }
  });

  // Mobile token refresh endpoint
  app.get("/mobile/refresh-token", async (c) => {
    try {
      // Get session token from Authorization header
      const authHeader = c.req.header("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ success: false, error: "Missing Bearer token" }, 401);
      }

      const sealedToken = authHeader.slice(7); // Remove "Bearer " prefix

      // Unseal the token to get session data
      const sessionData = await unsealData(sealedToken, {
        password: COOKIE_SECRET,
      }) as { did: string };

      if (!sessionData.did) {
        return c.json({ success: false, error: "Invalid session token" }, 401);
      }

      // Check if OAuth session still exists
      const oauthSession = await valTownStorage.get(
        `oauth_session:${sessionData.did}`,
      );
      if (!oauthSession) {
        return c.json(
          { success: false, error: "OAuth result not found" },
          401,
        );
      }

      // Implement actual token refresh logic using AT Protocol OAuth
      const oauthClient = new OAuthClient({
        clientId: `${BASE_URL}/client-metadata.json`,
        redirectUri: `${BASE_URL}/oauth/callback`,
        storage: valTownStorage,
      });

      try {
        // Create Session from stored data and refresh
        const session = new OAuthSession(oauthSession);
        const refreshedSession = await oauthClient.refresh(session);

        // Update the stored OAuth session with new tokens
        await valTownStorage.set(
          `oauth_session:${sessionData.did}`,
          refreshedSession.toJSON(),
        );

        // Create a new sealed token for the mobile client
        const newSealedToken = await sealData({ did: sessionData.did }, {
          password: COOKIE_SECRET,
        });

        return c.json({
          success: true,
          payload: {
            session_token: newSealedToken,
            did: sessionData.did,
            access_token: refreshedSession.accessToken,
            refresh_token: refreshedSession.refreshToken,
            expires_at: Date.now() + refreshedSession.timeUntilExpiry,
          },
        });
      } catch (refreshError) {
        console.error("AT Protocol token refresh failed:", refreshError);

        // Fallback: just return a new sealed session token (legacy behavior)
        const newSealedToken = await sealData({ did: sessionData.did }, {
          password: COOKIE_SECRET,
        });

        return c.json({
          success: true,
          payload: {
            session_token: newSealedToken,
            did: sessionData.did,
          },
          warning: "OAuth token refresh failed, using cached tokens",
        });
      }
    } catch (err) {
      console.error("Token refresh failed:", err);
      return c.json({ success: false, error: "Token refresh failed" }, 500);
    }
  });

  // Logout handler
  app.post("/api/auth/logout", async (c) => {
    try {
      const result = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
      });

      console.log("Logout: result DID:", result.did);

      if (result.did) {
        // Clean up server-side OAuth result data
        try {
          await valTownStorage.del(`oauth_result:${result.did}`);
          console.log("Logout: Cleaned up OAuth result data");
        } catch (err) {
          console.error("Error cleaning up OAuth result:", err);
        }
      }

      // Destroy the Iron Session (clears the cookie)
      await result.destroy();
      console.log("Logout: Session destroyed");

      return c.json({ success: true });
    } catch (err) {
      console.error("Logout failed:", err);
      return c.json({ success: false, error: "Logout failed" }, 500);
    }
  });

  // Session validation endpoint (for API authentication)
  app.get("/validate-result", async (c) => {
    try {
      const result = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
      });

      if (!result.did) {
        return c.json({ valid: false }, 401);
      }

      // Check if we have OAuth result data
      const oauthSession = await valTownStorage.get(
        `oauth_result:${result.did}`,
      );
      if (!oauthSession) {
        return c.json({ valid: false }, 401);
      }

      // Extend result TTL (sliding expiration)
      await result.save();

      return c.json({
        valid: true,
        did: result.did,
        handle: oauthSession.handle || oauthSession.handle_identifier,
      });
    } catch (err) {
      console.error("Session validation failed:", err);
      return c.json({ valid: false }, 401);
    }
  });

  return app;
}
