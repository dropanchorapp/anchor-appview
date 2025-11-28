// @val-town anchordashboard
// Main HTTP entry point for Anchor AppView - organized route groups
import { Hono } from "jsr:@hono/hono@4.9.6";
import { initializeTables } from "./backend/database/db.ts";
import { authRoutes } from "./backend/routes/auth.ts";
import { createFrontendRoutes } from "./backend/routes/frontend.ts";
import anchorApiHandler from "./backend/api/anchor-api.ts";
import { createCheckin, deleteCheckin } from "./backend/api/checkins.ts";

const app = new Hono();

// Initialize database on startup
await initializeTables();

// Mount auth routes FIRST - provides /login, /oauth/callback, /api/auth/session, etc.
app.route("/", authRoutes);

// Mount API routes (before catch-all frontend routes)
app.get("/api/nearby", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// REST-style checkin endpoints
// GET /api/checkins/:did - Get all checkins for a user
app.get("/api/checkins/:did", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// GET /api/checkins/:did/:rkey - Get a specific checkin
app.get("/api/checkins/:did/:rkey", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// POST /api/checkins - Create a new checkin
app.post("/api/checkins", async (c) => {
  return await createCheckin(c);
});

// DELETE /api/checkins/:did/:rkey - Delete a specific checkin
app.delete("/api/checkins/:did/:rkey", async (c) => {
  return await deleteCheckin(c);
});

// Likes and comments endpoints - handled by anchor-api
// Routes: /api/checkins/:did/:rkey/likes and /api/checkins/:did/:rkey/comments
app.get("/api/checkins/:did/:rkey/likes", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.post("/api/checkins/:did/:rkey/likes", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.delete("/api/checkins/:did/:rkey/likes", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/checkins/:did/:rkey/comments", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.post("/api/checkins/:did/:rkey/comments", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.delete("/api/checkins/:did/:rkey/comments", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Checkin migration endpoint - fixes coordinate format for legacy checkins
app.post("/api/migrate-checkins", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Note: /api/auth/session endpoint is provided by the OAuth package (oauthRoutes)

// Legacy /api/user endpoints for backward compatibility
app.get("/api/user/:identifier", (c) => {
  // Redirect to new REST endpoint
  const identifier = c.req.param("identifier");
  const newUrl = new URL(c.req.url);
  newUrl.pathname = `/api/checkins/${identifier}`;
  return Response.redirect(newUrl.toString(), 301);
});

app.get("/api/user", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/following", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/stats", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/places/nearby", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/places/search", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/places/categories", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Legacy /api/checkin/* endpoint for backward compatibility
app.get("/api/checkin/*", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Serve lexicon definitions
app.get("/.well-known/atproto-lexicons", async (c) => {
  try {
    const checkinLexicon = await Deno.readTextFile(
      "./lexicons/app/dropanchor/checkin.json",
    );
    const addressLexicon = await Deno.readTextFile(
      "./lexicons/community/lexicon/location/address.json",
    );

    return c.json({
      "app.dropanchor.checkin": JSON.parse(checkinLexicon),
      "community.lexicon.location.address": JSON.parse(addressLexicon),
    });
  } catch (_error) {
    return c.json({ error: "Failed to load lexicons" }, 500);
  }
});

// Debug endpoint for OAuth sessions
app.get("/api/debug/oauth-sessions", async (c) => {
  try {
    const { db } = await import("./backend/database/db.ts");
    const { ironSessionStorageTable } = await import(
      "./backend/database/schema.ts"
    );
    const { like } = await import("https://esm.sh/drizzle-orm@0.44.5");

    const FAILING_DID = "did:plc:aq7owa5y7ndc2hzjz37wy7ma";

    // Check all OAuth sessions (now stored in iron_session_storage with session: prefix)
    const allSessions = await db.select().from(ironSessionStorageTable)
      .where(like(ironSessionStorageTable.key, "session:%"));

    // Check for the specific failing DID
    const targetSessionKey = `session:${FAILING_DID}`;
    const targetSession = await db.select()
      .from(ironSessionStorageTable)
      .where(like(ironSessionStorageTable.key, targetSessionKey))
      .limit(1);

    // Test the OAuth sessions API directly
    const { sessions } = await import("./backend/routes/oauth.ts");
    let apiResult = null;
    try {
      const oauthSession = await sessions.getOAuthSession(FAILING_DID);
      apiResult = oauthSession
        ? {
          found: true,
          did: oauthSession.did,
          handle: oauthSession.handle,
          pdsUrl: oauthSession.pdsUrl,
        }
        : { found: false };
    } catch (error) {
      apiResult = { error: error.message };
    }

    return c.json({
      success: true,
      totalSessions: allSessions.length,
      targetDid: FAILING_DID,
      hasTargetSession: targetSession.length > 0,
      targetSessionDetails: targetSession.length > 0
        ? {
          key: targetSession[0].key,
          createdAt: targetSession[0].createdAt,
          expiresAt: targetSession[0].expiresAt,
          isExpired: targetSession[0].expiresAt
            ? new Date() > new Date(targetSession[0].expiresAt)
            : false,
        }
        : null,
      apiTest: apiResult,
      allSessions: allSessions.map((s) => ({
        key: s.key,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isExpired: s.expiresAt ? new Date() > new Date(s.expiresAt) : false,
      })),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// No admin routes mounted - PDS-only architecture
// No cron/ingestion routes mounted - PDS-only architecture

// Mount frontend routes LAST (contains catch-all route)
app.route("/", createFrontendRoutes());

export default app.fetch;
// Force Val Town cache refresh for oauth-client-deno@1.0.2 DPoP fix
