/**
 * OAuth authentication using @tijs/atproto-oauth package
 */

import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth@2.4.0";
import type { ATProtoOAuthInstance } from "jsr:@tijs/atproto-oauth@2.4.0";
import { sqliteAdapter, SQLiteStorage } from "jsr:@tijs/atproto-storage@1.0.0";
import { rawDb } from "../database/db.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

// OAuth scopes - granular permissions for specific lexicons
// Format: "atproto blob:*/* repo:collection?action=action"
const OAUTH_SCOPES = [
  "atproto",
  // Blob storage for checkin images
  "blob:*/*",
  // Checkin records - full CRUD
  "repo:app.dropanchor.checkin?action=create",
  "repo:app.dropanchor.checkin?action=read",
  "repo:app.dropanchor.checkin?action=update",
  "repo:app.dropanchor.checkin?action=delete",
  // Like records - full CRUD
  "repo:app.dropanchor.like?action=create",
  "repo:app.dropanchor.like?action=read",
  "repo:app.dropanchor.like?action=update",
  "repo:app.dropanchor.like?action=delete",
  // Comment records - full CRUD
  "repo:app.dropanchor.comment?action=create",
  "repo:app.dropanchor.comment?action=read",
  "repo:app.dropanchor.comment?action=update",
  "repo:app.dropanchor.comment?action=delete",
  // Address records - read + delete only (legacy support and migration cleanup)
  "repo:community.lexicon.location.address?action=read",
  "repo:community.lexicon.location.address?action=delete",
  // BeaconBits checkins - read only (for aggregated feeds)
  "repo:app.beaconbits.beacon?action=read",
].join(" ");

// Create OAuth instance using the package
const oauth: ATProtoOAuthInstance = createATProtoOAuth({
  baseUrl: BASE_URL,
  cookieSecret: COOKIE_SECRET,
  appName: "Anchor Location Feed",
  logoUri: "https://cdn.dropanchor.app/images/anchor-logo.png",
  policyUri: `${BASE_URL}/privacy-policy`,
  scope: OAUTH_SCOPES,
  sessionTtl: 60 * 60 * 24 * 30, // 30 days
  storage: new SQLiteStorage(sqliteAdapter(rawDb)),
  logger: console, // Enable logging for debugging
  mobileScheme: "anchor-app://auth-callback", // iOS app OAuth callback
});

// Export OAuth instance and sessions for use in auth routes
export const sessions = oauth.sessions;
export { oauth };
