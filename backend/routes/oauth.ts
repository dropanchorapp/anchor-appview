/**
 * OAuth authentication routes using @tijs/atproto-oauth-hono package
 */

import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth-hono@^0.3.0";
import type { ATProtoOAuthInstance } from "jsr:@tijs/atproto-oauth-hono@^0.3.0";
import { storage } from "../oauth/storage-adapter.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

// Create OAuth instance using the package
const oauth: ATProtoOAuthInstance = createATProtoOAuth({
  baseUrl: BASE_URL,
  cookieSecret: COOKIE_SECRET,
  mobileScheme: "anchor-app://auth-callback",
  appName: "Anchor Location Feed",
  logoUri: `${BASE_URL}/static/anchor-logo-transparent.png`,
  policyUri: `${BASE_URL}/privacy-policy`,
  sessionTtl: 60 * 60 * 24 * 30, // 30 days for mobile compatibility
  storage,
});

// Export what other parts of the app need
export const oauthRoutes = oauth.routes;
export const sessions = oauth.sessions;
