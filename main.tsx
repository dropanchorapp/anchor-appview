// @val-town anchordashboard
// Main HTTP entry point for Anchor AppView
import { Hono } from "https://esm.sh/hono";
import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";
import { initializeTables } from "./backend/database/db.ts";
import {
  deleteOAuthSession,
  getDashboardStats,
  getRecentCheckins,
  getSessionBySessionId as _getSessionBySessionId,
} from "./backend/database/queries.ts";
import {
  handleClientMetadata,
  handleOAuthCallback,
  handleOAuthStart,
} from "./backend/oauth/endpoints.ts";
import anchorApiHandler from "./backend/api/anchor-api.ts";

const app = new Hono();

// Initialize database on startup
await initializeTables();

// Serve static frontend files
app.get("/frontend/*", (c) => serveFile(c.req.path, import.meta.url));
app.get("/shared/*", (c) => serveFile(c.req.path, import.meta.url));

// OAuth endpoints
app.get("/client-metadata.json", async (_c) => {
  const response = await handleClientMetadata();
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

app.post("/api/auth/start", async (c) => {
  const response = await handleOAuthStart(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

app.get("/oauth/callback", async (c) => {
  const response = await handleOAuthCallback(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

// ========================================
// JSON API Routes (under /api/ namespace)
// ========================================
app.get("/api/global", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/nearby", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/user", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/following", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/stats", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/places/nearby", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

// ========================================
// Dashboard API Routes (for React frontend)
// ========================================
app.get("/api/feed", async (c) => {
  try {
    const checkins = await getRecentCheckins(50);
    return c.json({
      checkins,
      cursor: checkins.length > 0
        ? checkins[checkins.length - 1].id
        : undefined,
    });
  } catch (error) {
    console.error("Feed error:", error);
    return c.json({ error: "Failed to load feed" }, 500);
  }
});

app.get("/api/admin/stats", async (c) => {
  try {
    const stats = await getDashboardStats();
    return c.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    return c.json({ error: "Failed to load stats" }, 500);
  }
});

app.post("/api/admin/backfill", async (c) => {
  try {
    // Import and run the backfill function
    const backfillModule = await import(
      "./scripts/backfill-historical-checkins.ts"
    );
    const response = await backfillModule.default();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, response.status);
    }
  } catch (error) {
    console.error("Backfill error:", error);
    return c.json({ error: "Backfill failed", details: error.message }, 500);
  }
});

app.post("/api/admin/discover-checkins", async (c) => {
  try {
    // Import and run the comprehensive discovery
    const discoveryModule = await import(
      "./scripts/comprehensive-checkin-discovery.ts"
    );
    const response = await discoveryModule.default();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, response.status);
    }
  } catch (error) {
    console.error("Discovery error:", error);
    return c.json({
      error: "Discovery failed",
      details: error.message,
    }, 500);
  }
});

app.post("/api/admin/backfill-profiles", async (c) => {
  try {
    console.log("Starting profile backfill...");

    // Get all unique DIDs from checkins
    const { getAllCheckinDids } = await import("./backend/database/queries.ts");
    const dids = await getAllCheckinDids();

    if (dids.length === 0) {
      return c.json({ message: "No DIDs found to process", dids_processed: 0 });
    }

    // Initialize storage
    const { SqliteStorageProvider } = await import(
      "./backend/utils/storage-provider.ts"
    );
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

    const storage = new SqliteStorageProvider(sqlite);

    // Force resolve all profiles using direct fetching
    const { BlueskyProfileFetcher } = await import(
      "./backend/utils/profile-resolver.ts"
    );
    const fetcher = new BlueskyProfileFetcher();

    const resolvedProfiles = new Map();

    console.log(`Found DIDs to process: ${JSON.stringify(dids)}`);

    for (const did of dids) {
      try {
        console.log(`Resolving profile for DID: ${did}`);

        // Direct fetch to bypass any caching issues
        const profile = await fetcher.fetchProfile(did);
        console.log(`Profile fetched for ${did}:`, !!profile);

        if (profile) {
          // Store in cache
          await storage.setProfile(profile);
          resolvedProfiles.set(did, profile);
          console.log(`Stored profile for ${did}: ${profile.handle}`);
        } else {
          console.log(`No profile data returned for ${did}`);
        }
      } catch (error) {
        console.error(`Failed to resolve profile for ${did}:`, error);
      }
    }

    console.log(
      `Profile backfill completed: ${resolvedProfiles.size}/${dids.length} profiles resolved`,
    );

    return c.json({
      success: true,
      dids_found: dids.length,
      profiles_resolved: resolvedProfiles.size,
      resolved_profiles: Array.from(resolvedProfiles.entries()).map((
        [did, profile],
      ) => ({
        did,
        handle: profile.handle,
        displayName: profile.displayName,
        avatar: profile.avatar ? "✅" : "❌",
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Profile backfill error:", error);
    return c.json({
      success: false,
      error: "Profile backfill failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/admin/test-profile", async (c) => {
  try {
    // Test direct profile fetching
    const { BlueskyProfileFetcher } = await import(
      "./backend/utils/profile-resolver.ts"
    );
    const fetcher = new BlueskyProfileFetcher();

    const testDid = "did:plc:wxex3wx5k4ctciupsv5m5stb";
    console.log(`Testing profile fetch for ${testDid}`);

    const profile = await fetcher.fetchProfile(testDid);

    return c.json({
      success: true,
      test_did: testDid,
      profile_fetched: !!profile,
      profile_data: profile,
    });
  } catch (error) {
    console.error("Profile test error:", error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

app.post("/api/admin/resolve-addresses", async (c) => {
  try {
    console.log("Starting address resolution...");

    // Import the address resolution functions
    const { getUnresolvedAddresses, batchResolveAddresses } = await import(
      "./backend/utils/address-resolver.ts"
    );

    // Get unresolved addresses (limit to 20 to avoid overwhelming)
    const unresolvedAddresses = await getUnresolvedAddresses(20);

    if (unresolvedAddresses.length === 0) {
      return c.json({
        success: true,
        message: "No unresolved addresses found",
        resolved: 0,
        errors: 0,
      });
    }

    console.log(`Found ${unresolvedAddresses.length} unresolved addresses`);

    // Resolve them in batches
    const result = await batchResolveAddresses(unresolvedAddresses);

    console.log(
      `Address resolution complete: ${result.resolved} resolved, ${result.errors} errors`,
    );

    return c.json({
      success: true,
      message: "Address resolution completed",
      unresolved_found: unresolvedAddresses.length,
      resolved: result.resolved,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Address resolution error:", error);
    return c.json({
      success: false,
      error: "Address resolution failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/auth/session", async (c) => {
  try {
    const sessionCookie = c.req.header("cookie");
    const anchorSession = sessionCookie
      ?.split(";")
      .find((cookie) => cookie.trim().startsWith("anchor_session="))
      ?.split("=")[1];

    if (!anchorSession) {
      return c.json({ authenticated: false });
    }

    const session = await _getSessionBySessionId(anchorSession);
    if (!session) {
      return c.json({ authenticated: false });
    }

    // Return user info without sensitive tokens
    return c.json({
      authenticated: true,
      userHandle: session.handle,
      userDid: session.did,
      userDisplayName: session.display_name,
      userAvatar: session.avatar_url,
    });
  } catch (error) {
    console.error("Session check error:", error);
    return c.json({ authenticated: false });
  }
});

app.post("/api/auth/logout", async (c) => {
  try {
    const { did } = await c.req.json();

    if (!did) {
      return c.json({ error: "DID is required" }, 400);
    }

    await deleteOAuthSession(did);

    // Clear the session cookie
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "anchor_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/",
      },
    });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Logout failed" }, 500);
  }
});

// ========================================
// Frontend Routes (HTML/React views)
// ========================================

// Serve main app for all other routes
app.get("*", (_c) => serveFile("/frontend/index.html", import.meta.url));

// Error handler
app.onError((err, _c) => {
  console.error("Server error:", err);
  throw err; // Re-throw for full stack traces
});

// Export the Hono app's fetch handler for Val Town
export default app.fetch;
