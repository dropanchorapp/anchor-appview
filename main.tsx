// @val-town anchordashboard
// Main HTTP entry point for Anchor AppView - unified endpoints
import { Hono } from "https://esm.sh/hono";
import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";
import { initializeTables } from "./backend/database/db.ts";
import {
  deleteOAuthSession,
  getDashboardStats,
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
// Core Anchor API Routes (handled by anchor-api.ts)
// These routes provide the main API functionality with consistent CORS handling
// ========================================
app.all("/api/global", (c) => anchorApiHandler(c.req.raw));
app.all("/api/nearby", (c) => anchorApiHandler(c.req.raw));
app.all("/api/user", (c) => anchorApiHandler(c.req.raw));
app.all("/api/following", (c) => anchorApiHandler(c.req.raw));
app.all("/api/stats", (c) => anchorApiHandler(c.req.raw));
app.all("/api/places/nearby", (c) => anchorApiHandler(c.req.raw));
app.all("/api/checkins", (c) => anchorApiHandler(c.req.raw));

// ========================================
// Dashboard API Routes (for React frontend)
// ========================================
// Removed duplicate /api/feed endpoint - web and mobile both use /api/global

app.get("/api/admin/stats", async (c) => {
  try {
    const stats = await getDashboardStats();
    return c.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    return c.json({ error: "Failed to load stats" }, 500);
  }
});

app.post("/api/admin/backfill-addresses", async (c) => {
  try {
    console.log("Starting address backfill...");

    // Parse query parameters
    const url = new URL(c.req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const isDryRun = url.searchParams.get("dry_run") === "true";

    // Import and run backfill
    const { backfillAddresses } = await import(
      "./backend/admin/backfill-addresses-api.ts"
    );
    const result = await backfillAddresses(limit, isDryRun);

    console.log(
      `Address backfill completed: ${result.stats?.updated || 0} updated, ${
        result.stats?.errors || 0
      } errors`,
    );

    return c.json(result);
  } catch (error) {
    console.error("Address backfill error:", error);
    return c.json({
      success: false,
      error: "Failed to run address backfill",
      message: error.message,
    }, 500);
  }
});

// Removed old backfill endpoint - use /api/admin/clean-and-backfill instead

// Removed old discovery endpoint - use /api/admin/clean-and-backfill instead

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

app.get("/api/admin/check-users", async (c) => {
  try {
    console.log("Running user migration diagnostic check...");

    const checkModule = await import("./backend/admin/check-existing-users.ts");
    await checkModule.default();

    return c.json({
      success: true,
      message:
        "User diagnostic check completed successfully. See server logs for details.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("User check error:", error);
    return c.json({
      success: false,
      error: "User check failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/admin/simple-user-check", async (c) => {
  try {
    console.log("Running simple user check...");

    const checkModule = await import("./backend/admin/simple-user-check.ts");
    const result = await checkModule.default();

    return c.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Simple user check error:", error);
    return c.json({
      success: false,
      error: "Simple user check failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/admin/db-diagnostic", async (c) => {
  try {
    console.log("Running database diagnostic...");

    const diagnosticModule = await import("./backend/admin/db-diagnostic.ts");
    const result = await diagnosticModule.default();

    return c.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Database diagnostic error:", error);
    return c.json({
      success: false,
      error: "Database diagnostic failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/admin/user-sync-diagnostic", async (c) => {
  try {
    console.log("Running user sync diagnostic...");

    const diagnosticModule = await import(
      "./backend/admin/user-sync-diagnostic.ts"
    );
    const result = await diagnosticModule.default();

    return c.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("User sync diagnostic error:", error);
    return c.json({
      success: false,
      error: "User sync diagnostic failed",
      details: error.message,
    }, 500);
  }
});

app.post("/api/admin/sync-missing-users", async (c) => {
  try {
    console.log("Starting user sync repair...");

    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // Default to dry run

    const syncModule = await import("./backend/admin/sync-missing-users.ts");
    const result = await syncModule.default(dryRun);

    return c.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("User sync repair error:", error);
    return c.json({
      success: false,
      error: "User sync repair failed",
      details: error.message,
    }, 500);
  }
});

app.post("/api/admin/run-migrations", async (c) => {
  try {
    console.log("Running database migrations manually...");

    const migrationModule = await import("./backend/admin/run-migrations.ts");
    const result = await migrationModule.default();

    return c.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Migration error:", error);
    return c.json({
      success: false,
      error: "Migration failed",
      details: error.message,
    }, 500);
  }
});

app.post("/api/admin/migrate-users", (c) => {
  // TODO: Implement user migration script
  return c.json({
    success: false,
    error: "User migration endpoint not yet implemented",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/admin/cleanup-invalid-checkins", (c) => {
  // TODO: Implement cleanup script
  return c.json({
    success: false,
    error: "Cleanup endpoint not yet implemented",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/admin/crawl-followers", async (c) => {
  try {
    console.log("Starting followers crawler...");

    const crawlerModule = await import(
      "./backend/ingestion/followers-crawler.ts"
    );
    const response = await crawlerModule.default();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, { status: response.status as any });
    }
  } catch (error) {
    console.error("Followers crawler error:", error);
    return c.json({
      error: "Followers crawler failed",
      details: error.message,
    }, 500);
  }
});

// ========================================
// Cron-ready crawler endpoints
// ========================================

app.post("/api/cron/checkins", async (c) => {
  try {
    const cronModule = await import("./backend/admin/cron-crawlers.ts");
    const response = await cronModule.cronCheckins();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, { status: response.status as any });
    }
  } catch (error) {
    console.error("Cron checkins crawler error:", error);
    return c.json({
      error: "Cron checkins crawler failed",
      details: error.message,
    }, 500);
  }
});

app.post("/api/cron/followers", async (c) => {
  try {
    const cronModule = await import("./backend/admin/cron-crawlers.ts");
    const response = await cronModule.cronFollowers();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, { status: response.status as any });
    }
  } catch (error) {
    console.error("Cron followers crawler error:", error);
    return c.json({
      error: "Cron followers crawler failed",
      details: error.message,
    }, 500);
  }
});

// Address resolution endpoint removed - address resolver was using removed database tables

// Backfill endpoints using the consolidated script
app.post("/api/admin/backfill", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const mode = body.mode || "incremental"; // default to incremental

    console.log(`Starting ${mode} backfill...`);

    const backfillModule = await import("./backend/admin/backfill-checkins.ts");
    const response = await backfillModule.default({ mode });

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, { status: response.status as any });
    }
  } catch (error) {
    console.error("Backfill error:", error);
    return c.json({
      error: "Backfill failed",
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
      // Note: displayName and avatar would need to be fetched from profile cache
      // For now, just returning basic session info
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
// Mobile OAuth Routes
// ========================================

// Mobile authentication page for WebView integration
app.get(
  "/mobile-auth",
  (_c) => serveFile("/frontend/index.html", import.meta.url),
);

// Mobile token validation endpoint
app.post("/api/auth/validate-mobile-session", async (c) => {
  try {
    const { access_token, refresh_token, did, handle, session_id } = await c.req
      .json();

    if (!access_token || !refresh_token || !did || !handle) {
      return c.json(
        { valid: false, error: "Missing required parameters" },
        400,
      );
    }

    // Validate that the tokens are properly formatted JWTs
    const isValidJWT = (token: string) => {
      try {
        const parts = token.split(".");
        return parts.length === 3 && parts.every((part) => part.length > 0);
      } catch {
        return false;
      }
    };

    if (!isValidJWT(access_token) || !isValidJWT(refresh_token)) {
      return c.json({ valid: false, error: "Invalid token format" }, 400);
    }

    return c.json({
      valid: true,
      user: {
        did,
        handle,
        sessionId: session_id,
      },
    });
  } catch (error) {
    console.error("Mobile session validation error:", error);
    return c.json({ valid: false, error: "Validation failed" }, 500);
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
