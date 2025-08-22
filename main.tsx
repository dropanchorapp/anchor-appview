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
import { getStoredSession as _getStoredSession } from "./backend/oauth/session.ts";
import {
  handleClientMetadata,
  handleMobileOAuthCallback,
  handleMobileOAuthStart,
  handleMobileTokenExchange,
  handleOAuthCallback,
  handleOAuthStart,
} from "./backend/oauth/endpoints.ts";
import { getOAuthSessionStats } from "./backend/oauth/session-cleanup.ts";
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

// Mobile OAuth endpoints
app.post("/api/auth/mobile-start", async (c) => {
  const response = await handleMobileOAuthStart(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

app.get("/oauth/mobile-callback", async (c) => {
  const response = await handleMobileOAuthCallback(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

// Mobile token exchange endpoint
app.post("/api/auth/exchange", async (c) => {
  const response = await handleMobileTokenExchange(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

// Terms of Service endpoint
app.get("/terms", (_c) => {
  return new Response(
    `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Terms of Service - Anchor</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; 
        }
        h1 { color: #1a365d; }
        .last-updated { color: #666; font-style: italic; }
      </style>
    </head>
    <body>
      <h1>Terms of Service</h1>
      <p class="last-updated">Last updated: ${
      new Date().toLocaleDateString()
    }</p>
      
      <h2>1. Acceptance of Terms</h2>
      <p>By using Anchor, you agree to these Terms of Service. Anchor is a location-based social app for the AT Protocol network.</p>
      
      <h2>2. Description of Service</h2>
      <p>Anchor allows users to:</p>
      <ul>
        <li>Check in at locations and share with the AT Protocol network</li>
        <li>View location-based posts from other users</li>
        <li>Connect with the decentralized social web via Bluesky and AT Protocol</li>
      </ul>
      
      <h2>3. User Responsibilities</h2>
      <p>Users are responsible for:</p>
      <ul>
        <li>Providing accurate location information</li>
        <li>Respecting others' privacy and safety</li>
        <li>Complying with local laws regarding location sharing</li>
        <li>Maintaining the security of their account credentials</li>
      </ul>
      
      <h2>4. Privacy and Data</h2>
      <p>Your location data and posts are stored on your chosen AT Protocol PDS (Personal Data Server). 
         Anchor does not permanently store your personal data. See our <a href="/privacy">Privacy Policy</a> for details.</p>
      
      <h2>5. Content Policy</h2>
      <p>Users must not post content that is illegal, harmful, or violates others' rights. 
         Content moderation follows AT Protocol and your chosen PDS policies.</p>
      
      <h2>6. Service Availability</h2>
      <p>Anchor is provided "as is" without warranties. We may modify or discontinue the service at any time.</p>
      
      <h2>7. Contact</h2>
      <p>For questions about these terms, contact us through the AT Protocol network or via our project repository.</p>
    </body>
    </html>
  `,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
});

// Privacy Policy endpoint
app.get("/privacy", (_c) => {
  return new Response(
    `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Privacy Policy - Anchor</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; 
        }
        h1 { color: #1a365d; }
        .last-updated { color: #666; font-style: italic; }
        .highlight { background: #e6f3ff; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p class="last-updated">Last updated: ${
      new Date().toLocaleDateString()
    }</p>
      
      <div class="highlight">
        <strong>Key Principle:</strong> Anchor is built on the AT Protocol, which means your data belongs to you 
        and is stored on your chosen Personal Data Server (PDS), not on Anchor's servers.
      </div>
      
      <h2>1. Information We Collect</h2>
      <h3>Location Data</h3>
      <p>When you check in at locations, we collect:</p>
      <ul>
        <li>GPS coordinates of your check-ins</li>
        <li>Place names and addresses from OpenStreetMap</li>
        <li>Your custom messages associated with check-ins</li>
      </ul>
      
      <h3>Authentication Data</h3>
      <p>For OAuth authentication with AT Protocol:</p>
      <ul>
        <li>Your AT Protocol handle and DID</li>
        <li>Temporary OAuth tokens (refreshed automatically)</li>
        <li>Your chosen PDS URL</li>
      </ul>
      
      <h2>2. How We Use Your Information</h2>
      <p>Your information is used to:</p>
      <ul>
        <li>Enable location-based check-ins</li>
        <li>Display your posts on the AT Protocol network</li>
        <li>Provide location-based feeds and discovery</li>
        <li>Maintain your authentication session</li>
      </ul>
      
      <h2>3. Data Storage and Control</h2>
      <div class="highlight">
        <h3>Your Data, Your Server</h3>
        <p>All your check-ins and location data are stored as AT Protocol records on YOUR chosen PDS. 
           Anchor does not permanently store your personal content.</p>
      </div>
      
      <h3>What We Store Temporarily</h3>
      <ul>
        <li>OAuth session tokens (for authentication)</li>
        <li>Cached feed data (for performance)</li>
        <li>Anonymous usage statistics</li>
      </ul>
      
      <h2>4. Data Sharing</h2>
      <p>Your location check-ins are published to the AT Protocol network according to your PDS's settings. 
         This means they may be visible to other AT Protocol applications and users, subject to your chosen visibility settings.</p>
      
      <h2>5. Third-Party Services</h2>
      <p>Anchor integrates with:</p>
      <ul>
        <li><strong>OpenStreetMap:</strong> For place data and geocoding</li>
        <li><strong>AT Protocol Network:</strong> For decentralized social features</li>
        <li><strong>Your PDS:</strong> For storing your data</li>
      </ul>
      
      <h2>6. Your Rights</h2>
      <p>Because your data is stored on AT Protocol:</p>
      <ul>
        <li>You can export all your data at any time</li>
        <li>You can delete your data by deleting it from your PDS</li>
        <li>You can switch PDS providers and take your data with you</li>
        <li>You control who can see your location data</li>
      </ul>
      
      <h2>7. Security</h2>
      <p>We protect your data using:</p>
      <ul>
        <li>OAuth 2.1 with PKCE for secure authentication</li>
        <li>DPoP (Demonstration of Proof of Possession) for token security</li>
        <li>HTTPS encryption for all communications</li>
        <li>Secure credential storage in iOS Keychain</li>
      </ul>
      
      <h2>8. Children's Privacy</h2>
      <p>Anchor is not intended for users under 13. We do not knowingly collect personal information from children under 13.</p>
      
      <h2>9. Changes to This Policy</h2>
      <p>We may update this privacy policy as needed. Changes will be posted at this URL with an updated date.</p>
      
      <h2>10. Contact Us</h2>
      <p>For privacy questions, contact us through the AT Protocol network or via our project repository.</p>
      
      <div class="highlight">
        <h3>AT Protocol Benefits</h3>
        <p>By building on AT Protocol, Anchor ensures your location data remains under your control, 
           portable between services, and not locked into any single platform.</p>
      </div>
    </body>
    </html>
  `,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
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
app.all("/api/places/categories", (c) => anchorApiHandler(c.req.raw));
app.all("/api/checkins", (c) => anchorApiHandler(c.req.raw));
app.all("/api/checkin/*", (c) => anchorApiHandler(c.req.raw));

// ========================================
// Dashboard API Routes (for React frontend)
// ========================================
// Removed duplicate /api/feed endpoint - web and mobile both use /api/global

app.get("/api/admin/oauth-stats", async (c) => {
  try {
    const stats = await getOAuthSessionStats();
    return c.json({
      success: true,
      oauth_sessions: stats,
    });
  } catch (error) {
    console.error("OAuth stats error:", error);
    return c.json({ success: false, error: error.message }, 500);
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
    // Force refresh - using sqlite2
    const { sqlite } = await import("https://esm.town/v/std/sqlite2");

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
    // Use unified authentication (supports both cookies and Bearer headers)
    const { authenticateRequest } = await import(
      "./backend/middleware/auth-middleware.ts"
    );
    const authResult = await authenticateRequest(c);

    if (!authResult) {
      return c.json({ authenticated: false });
    }

    const { session } = authResult;

    // Touch the session to extend its lifetime (updates updated_at timestamp)
    const { touchSession } = await import("./backend/oauth/session.ts");
    await touchSession(session.did);

    // Get display name and avatar from database
    const { sqlite } = await import("https://esm.town/v/std/sqlite2");
    const result = await sqlite.execute({
      sql: `SELECT display_name, avatar_url FROM oauth_sessions WHERE did = ?`,
      args: [session.did],
    });

    const displayName = result.rows?.[0]?.[0] as string | null;
    const avatar = result.rows?.[0]?.[1] as string | null;

    // Return user info without sensitive tokens
    return c.json({
      authenticated: true,
      userHandle: session.handle,
      userDid: session.did,
      userDisplayName: displayName,
      userAvatar: avatar,
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

// Checkin detail pages with dynamic meta tags
app.get("/checkin/*", async (c) => {
  const url = new URL(c.req.url);
  const checkinId = url.pathname.split("/checkin/")[1];

  if (!checkinId) {
    return serveFile("/frontend/index.html", import.meta.url);
  }

  try {
    // Fetch checkin data for meta tags
    const checkinResponse = await fetch(
      `${url.origin}/api/checkin/${checkinId}`,
    );

    if (checkinResponse.ok) {
      const checkin = await checkinResponse.json();

      // Create dynamic HTML with meta tags
      const baseHtml = await serveFile("/frontend/index.html", import.meta.url);
      const htmlText = await baseHtml.text();

      const description = checkin.text
        ? `${checkin.text} - Check-in by ${
          checkin.author.displayName || checkin.author.handle
        }`
        : `Check-in by ${checkin.author.displayName || checkin.author.handle}`;

      const locationText = checkin.address?.name
        ? `at ${checkin.address.name}`
        : checkin.coordinates
        ? `at ${checkin.coordinates.latitude.toFixed(4)}, ${
          checkin.coordinates.longitude.toFixed(4)
        }`
        : "";

      const title = `${
        checkin.author.displayName || checkin.author.handle
      } ${locationText} - Anchor`;

      // Inject meta tags
      const metaTags = `
        <meta property="og:title" content="${title.replace(/"/g, "&quot;")}" />
        <meta property="og:description" content="${
        description.replace(/"/g, "&quot;")
      }" />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="${url.origin}/checkin/${checkinId}" />
        <meta property="og:site_name" content="Anchor" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="${title.replace(/"/g, "&quot;")}" />
        <meta name="twitter:description" content="${
        description.replace(/"/g, "&quot;")
      }" />
        ${
        checkin.author.avatar
          ? `<meta property="og:image" content="${checkin.author.avatar}" />`
          : ""
      }
      `;

      const enhancedHtml = htmlText.replace(
        "<title>Anchor</title>",
        `<title>${title.replace(/"/g, "&quot;")}</title>${metaTags}`,
      );

      return new Response(enhancedHtml, {
        headers: { "Content-Type": "text/html" },
      });
    }
  } catch (error) {
    console.error("Failed to generate checkin meta tags:", error);
  }

  // Fallback to regular HTML
  return serveFile("/frontend/index.html", import.meta.url);
});

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

    // Get the stored session to check if tokens need refreshing
    const storedSession = await _getStoredSession(did);
    if (storedSession) {
      // Touch the session to extend its lifetime (updates updated_at timestamp)
      const { touchSession } = await import("./backend/oauth/session.ts");
      await touchSession(did);

      // Check if we should refresh the tokens (they're different from stored ones)
      if (
        storedSession.accessToken !== access_token ||
        storedSession.refreshToken !== refresh_token
      ) {
        // Try to refresh the tokens using the stored session data
        const { refreshOAuthToken } = await import("./backend/oauth/dpop.ts");
        const refreshedSession = await refreshOAuthToken(storedSession);

        if (refreshedSession) {
          // Return the refreshed tokens to the mobile client
          return c.json({
            valid: true,
            refreshed: true,
            tokens: {
              access_token: refreshedSession.accessToken,
              refresh_token: refreshedSession.refreshToken,
            },
            user: {
              did,
              handle,
              sessionId: session_id,
            },
          });
        }
      }
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

// Mobile token refresh endpoint - allows mobile clients to explicitly refresh tokens
app.post("/api/auth/refresh-mobile-token", async (c) => {
  try {
    const { refresh_token, did, handle } = await c.req.json();

    if (!refresh_token || !did || !handle) {
      return c.json(
        { success: false, error: "Missing required parameters" },
        400,
      );
    }

    // Get the stored session
    const storedSession = await _getStoredSession(did);
    if (!storedSession) {
      return c.json(
        { success: false, error: "Session not found" },
        404,
      );
    }

    // Verify the refresh token matches
    if (storedSession.refreshToken !== refresh_token) {
      return c.json(
        { success: false, error: "Invalid refresh token" },
        401,
      );
    }

    // Try to refresh the tokens
    const { refreshOAuthToken } = await import("./backend/oauth/dpop.ts");
    const refreshedSession = await refreshOAuthToken(storedSession);

    if (!refreshedSession) {
      return c.json(
        { success: false, error: "Token refresh failed" },
        500,
      );
    }

    // Return the new tokens
    return c.json({
      success: true,
      tokens: {
        access_token: refreshedSession.accessToken,
        refresh_token: refreshedSession.refreshToken,
      },
      user: {
        did: refreshedSession.did,
        handle: refreshedSession.handle,
      },
    });
  } catch (error) {
    console.error("Mobile token refresh error:", error);
    return c.json({ success: false, error: "Token refresh failed" }, 500);
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
