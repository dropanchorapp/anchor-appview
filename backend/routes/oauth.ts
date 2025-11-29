/**
 * OAuth authentication using @tijs/atproto-oauth package
 */

import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth@2.0.0";
import type { ATProtoOAuthInstance } from "jsr:@tijs/atproto-oauth@2.0.0";
import { SQLiteStorage, valTownAdapter } from "jsr:@tijs/atproto-storage@0.1.1";
import { rawDb } from "../database/db.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

// Create OAuth instance using the package
const oauth: ATProtoOAuthInstance = createATProtoOAuth({
  baseUrl: BASE_URL,
  cookieSecret: COOKIE_SECRET,
  appName: "Anchor Location Feed",
  logoUri:
    "https://res.cloudinary.com/dru3aznlk/image/upload/v1754747200/anchor-logo-transparent_nrw70y.png",
  policyUri: `${BASE_URL}/privacy-policy`,
  sessionTtl: 60 * 60 * 24 * 30, // 30 days
  storage: new SQLiteStorage(valTownAdapter(rawDb)),
  logger: console, // Enable logging for debugging
});

// Export OAuth instance and sessions for use in auth routes
export const sessions = oauth.sessions;
export { oauth };
