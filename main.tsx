// @val-town anchordashboard
// Main HTTP entry point for Anchor AppView - organized route groups
import { Hono } from "jsr:@hono/hono@4.9.6";
import { initializeTables } from "./backend/database/db.ts";
import { oauthRoutes } from "./backend/routes/oauth.ts";
import { createAdminRoutes } from "./backend/routes/admin.ts";
import { createCronRoutes } from "./backend/routes/cron.ts";
import { createFrontendRoutes } from "./backend/routes/frontend.ts";
import anchorApiHandler from "./backend/api/anchor-api.ts";

const app = new Hono();

// Initialize database on startup
await initializeTables();

// Mount API routes FIRST (before catch-all frontend routes)
app.get("/api/nearby", async (c) => {
  return await anchorApiHandler(c.req.raw);
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

app.get("/api/checkin/*", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Check-in creation endpoint
app.post("/api/checkins", async (c) => {
  return await anchorApiHandler(c.req.raw);
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

      // Also try getStoredOAuthData to see raw session data
      const storedData = await sessions.getStoredOAuthData(FAILING_DID);
      apiResult.storedData = storedData
        ? {
          found: true,
          did: storedData.did,
          handle: storedData.handle,
          hasTokens: !!(storedData.accessToken && storedData.refreshToken),
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

// Mount other route groups
app.route("/", oauthRoutes);
app.route("/", createAdminRoutes());
app.route("/", createCronRoutes());

// Mount frontend routes LAST (contains catch-all route)
app.route("/", createFrontendRoutes());

export default app.fetch;
// Force Val Town cache refresh for oauth-client-deno@1.0.2 DPoP fix
