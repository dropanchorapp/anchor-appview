/**
 * Auth routes - combines OAuth library handlers with app-specific endpoints
 */

import type { App } from "@fresh/core";
import { isValidHandle } from "npm:@atproto/syntax@0.3.0";
import { getOAuth } from "./oauth.ts";
import { getSessionFromRequest } from "../utils/session.ts";
import { migrateUserCheckinsInBackground } from "../services/checkin-migration-service.ts";
import { resolveProfileFromPds } from "../utils/atproto-resolver.ts";

interface MobileStartRequest {
  handle: string;
  code_challenge: string;
}

export function registerAuthRoutes(app: App<any>): App<any> {
  // === Core OAuth routes (from library) ===

  app = app.get("/login", (ctx) => getOAuth().handleLogin(ctx.req));
  app = app.get("/oauth/callback", (ctx) => getOAuth().handleCallback(ctx.req));
  app = app.get(
    "/oauth-client-metadata.json",
    () => getOAuth().handleClientMetadata(),
  );
  app = app.post("/api/auth/logout", (ctx) => getOAuth().handleLogout(ctx.req));

  // === App-specific session endpoint ===

  /**
   * Session endpoint supporting both web (cookies) and mobile (Bearer tokens)
   */
  app = app.get("/api/auth/session", async (ctx) => {
    const result = await getSessionFromRequest(ctx.req);

    if (!result.session) {
      return Response.json({
        valid: false,
        error: result.error?.message || "Not authenticated",
        reason: result.error?.type || "unknown",
      }, { status: 401 });
    }

    // Trigger background migration for old format checkins (non-blocking)
    migrateUserCheckinsInBackground({
      did: result.session.did,
      pdsUrl: result.session.pdsUrl,
      makeRequest: result.session.makeRequest.bind(result.session),
    });

    // Fetch profile data (avatar, displayName) for the session
    let avatar: string | undefined;
    let displayName: string | undefined;
    try {
      const profile = await resolveProfileFromPds(result.session.did);
      if (profile) {
        avatar = profile.avatar;
        displayName = profile.displayName;
      }
    } catch (profileError) {
      console.warn("[Session] Failed to fetch profile:", profileError);
    }

    const response = Response.json({
      valid: true,
      did: result.session.did,
      handle: result.session.handle,
      userHandle: result.session.handle,
      displayName,
      avatar,
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
    });

    if (result.setCookieHeader) {
      response.headers.set("Set-Cookie", result.setCookieHeader);
    }

    return response;
  });

  // === Mobile OAuth endpoints ===

  /**
   * Start mobile OAuth flow with PKCE
   */
  app = app.post("/api/auth/mobile-start", async (ctx) => {
    try {
      const body: MobileStartRequest = await ctx.req.json();
      const { handle, code_challenge } = body;

      if (!handle || typeof handle !== "string") {
        return Response.json(
          { success: false, error: "Invalid handle" },
          { status: 400 },
        );
      }

      if (!isValidHandle(handle)) {
        return Response.json(
          { success: false, error: "Invalid handle format" },
          { status: 400 },
        );
      }

      if (!code_challenge || typeof code_challenge !== "string") {
        return Response.json(
          { success: false, error: "Missing code_challenge" },
          { status: 400 },
        );
      }

      console.log(`Starting mobile OAuth for handle: ${handle}`);

      const loginUrl = new URL("/login", ctx.req.url);
      loginUrl.searchParams.set("handle", handle);
      loginUrl.searchParams.set("mobile", "true");

      const authUrl = loginUrl.toString();
      console.log(`Mobile auth URL generated: ${authUrl}`);

      return Response.json({ success: true, authUrl });
    } catch (err) {
      console.error("Mobile OAuth start failed:", err);
      return Response.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Couldn't initiate login",
        },
        { status: 400 },
      );
    }
  });

  /**
   * Validate session endpoint (legacy compatibility)
   */
  app = app.get("/validate-session", async (ctx) => {
    const result = await getSessionFromRequest(ctx.req);

    if (!result.session) {
      return Response.json({ valid: false }, { status: 401 });
    }

    const response = Response.json({
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
   */
  app = app.get("/mobile/refresh-token", async (ctx) => {
    try {
      const authHeader = ctx.req.headers.get("Authorization");
      if (!authHeader) {
        return Response.json(
          { success: false, error: "Missing Authorization header" },
          { status: 401 },
        );
      }

      const result = await getSessionFromRequest(ctx.req);

      if (!result.session) {
        return Response.json(
          {
            success: false,
            error: result.error?.message || "Session not found",
          },
          { status: 401 },
        );
      }

      return Response.json({
        success: true,
        did: result.session.did,
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
      });
    } catch (err) {
      console.error("Token refresh failed:", err);
      return Response.json(
        { success: false, error: "Token refresh failed" },
        { status: 500 },
      );
    }
  });

  return app;
}
