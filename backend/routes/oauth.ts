/**
 * OAuth authentication using @tijs/atproto-oauth package.
 * Supports lazy initialization to derive BASE_URL from incoming requests.
 */

import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth@2.4.0";
import type { ATProtoOAuthInstance } from "jsr:@tijs/atproto-oauth@2.4.0";
import { sqliteAdapter, SQLiteStorage } from "jsr:@tijs/atproto-storage@1.0.0";
import { rawDb } from "../database/db.ts";

// OAuth scopes - granular permissions for specific lexicons
const OAUTH_SCOPES = [
  "atproto",
  "blob:*/*",
  "repo:app.dropanchor.checkin?action=create",
  "repo:app.dropanchor.checkin?action=read",
  "repo:app.dropanchor.checkin?action=update",
  "repo:app.dropanchor.checkin?action=delete",
  "repo:app.dropanchor.like?action=create",
  "repo:app.dropanchor.like?action=read",
  "repo:app.dropanchor.like?action=update",
  "repo:app.dropanchor.like?action=delete",
  "repo:app.dropanchor.comment?action=create",
  "repo:app.dropanchor.comment?action=read",
  "repo:app.dropanchor.comment?action=update",
  "repo:app.dropanchor.comment?action=delete",
  "repo:community.lexicon.location.address?action=read",
  "repo:community.lexicon.location.address?action=delete",
  "repo:app.beaconbits.beacon?action=read",
].join(" ");

// OAuth instance and base URL — initialized lazily
let oauth: ATProtoOAuthInstance | null = null;
let baseUrl: string | null = null;

/**
 * Initialize OAuth with the given request.
 * If ANCHOR_BASE_URL env var is set, uses that. Otherwise derives from request.
 * Safe to call multiple times — only initializes once.
 */
export function initOAuth(request: Request): ATProtoOAuthInstance {
  if (oauth) return oauth;

  const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
    "anchor-default-secret-for-development-only";

  // Use ANCHOR_BASE_URL from environment, or derive from request
  if (!baseUrl) {
    const envBaseUrl = Deno.env.get("ANCHOR_BASE_URL");
    if (envBaseUrl) {
      baseUrl = envBaseUrl.replace(/\/$/, "");
      console.log(`Using ANCHOR_BASE_URL from environment: ${baseUrl}`);
    } else {
      const url = new URL(request.url);
      const forwardedProto = request.headers.get("X-Forwarded-Proto");
      const protocol = forwardedProto || url.protocol.replace(":", "");
      baseUrl = `${protocol}://${url.host}`;
      console.log(`Derived BASE_URL from request: ${baseUrl}`);
    }
  }

  oauth = createATProtoOAuth({
    baseUrl,
    cookieSecret: COOKIE_SECRET,
    appName: "Anchor Location Feed",
    logoUri: "https://cdn.dropanchor.app/images/anchor-logo.png",
    policyUri: `${baseUrl}/privacy-policy`,
    scope: OAUTH_SCOPES,
    sessionTtl: 60 * 60 * 24 * 30, // 30 days
    storage: new SQLiteStorage(sqliteAdapter(rawDb)),
    logger: console,
    mobileScheme: "anchor-app://auth-callback",
  });

  console.log("OAuth client initialized", {
    clientId: `${baseUrl}/oauth-client-metadata.json`,
  });

  return oauth;
}

/**
 * Get the OAuth instance. Must be called after initOAuth().
 */
export function getOAuth(): ATProtoOAuthInstance {
  if (!oauth) {
    throw new Error("OAuth not initialized — call initOAuth first");
  }
  return oauth;
}

/**
 * Get the sessions API. Must be called after initOAuth().
 */
export function getSessions() {
  return getOAuth().sessions;
}
