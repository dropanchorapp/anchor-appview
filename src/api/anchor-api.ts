// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";
import { ATProtocolProfileResolver } from "../utils/profile-resolver-v2.ts";
import {
  ProfileData,
  SqliteStorageProvider,
} from "../utils/storage-provider.ts";
import {
  handleClientMetadata,
  handleOAuthCallback,
  handleOAuthStart,
} from "../oauth/endpoints.ts";
import { initializeOAuthTables } from "../oauth/session.ts";

// Types for better TypeScript support
interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

interface CheckinRecord {
  id: string;
  uri: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text: string;
  createdAt: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  address?: {
    name?: string;
    street?: string;
    locality?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  distance?: number;
}

export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const corsHeaders: CorsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle OAuth endpoints first
  if (url.pathname === "/client-metadata.json") {
    return handleClientMetadata();
  }

  if (url.pathname === "/api/auth/start" && req.method === "POST") {
    return handleOAuthStart(req);
  }

  if (url.pathname === "/oauth/callback") {
    return handleOAuthCallback(req);
  }

  // Login page
  if (url.pathname === "/login") {
    await initializeOAuthTables();
    const html = generateLoginHTML(url);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, max-age=0",
      },
    });
  }

  // Main dashboard
  if (url.pathname === "/") {
    await initializeTables();
    await initializeOAuthTables();
    const stats = await getDashboardStats();
    const html = generateDashboardHTML(stats, url);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, max-age=0",
      },
    });
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize database tables - let errors bubble up
  await initializeTables();

  // Route to appropriate handler - let errors bubble up
  switch (url.pathname) {
    case "/global":
      return await getGlobalFeed(url, corsHeaders);
    case "/nearby":
      return await getNearbyCheckins(url, corsHeaders);
    case "/user":
      return await getUserCheckins(url, corsHeaders);
    case "/following":
      return await getFollowingFeed(url, corsHeaders);
    case "/stats":
      return await getStats(corsHeaders);
    default:
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: corsHeaders,
      });
  }
}

async function initializeTables() {
  // Ensure all tables exist
  const storage = new SqliteStorageProvider(sqlite);
  await storage.ensureTablesExist();

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      author_handle TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      address_ref_uri TEXT,
      address_ref_cid TEXT,
      cached_address_name TEXT,
      cached_address_street TEXT,
      cached_address_locality TEXT,
      cached_address_region TEXT,
      cached_address_country TEXT,
      cached_address_postal_code TEXT,
      cached_address_full JSON,
      address_resolved_at TEXT,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS user_follows_v1 (
      follower_did TEXT NOT NULL,
      following_did TEXT NOT NULL,
      created_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_did, following_did)
    )
  `);

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS address_cache_v1 (
      uri TEXT PRIMARY KEY,
      cid TEXT,
      name TEXT,
      street TEXT,
      locality TEXT,
      region TEXT,
      country TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      full_data JSON,
      resolved_at TEXT,
      failed_at TEXT
    )
  `);

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS processing_log_v1 (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);

  // Create indexes
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins_v1(created_at DESC)`,
  );
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_author ON checkins_v1(author_did)`,
  );
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins_v1(latitude, longitude)`,
  );
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows_v1(follower_did)`,
  );
}

async function getGlobalFeed(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const cursor = url.searchParams.get("cursor");

  let query = `
    SELECT id, uri, author_did, author_handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins_v1
  `;

  const params: any[] = [];

  if (cursor) {
    query += ` WHERE created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const results = await sqlite.execute(query, params);
  const rows = results.rows || [];

  // Resolve profiles for all authors
  const dids = [...new Set(rows.map((row) => row.author_did as string))];
  const storage = new SqliteStorageProvider(sqlite);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const checkins = rows.map((row) => formatCheckin(row, profiles));

  return new Response(
    JSON.stringify({
      checkins,
      cursor: checkins.length > 0
        ? checkins[checkins.length - 1].createdAt
        : null,
    }),
    { headers: corsHeaders },
  );
}

async function getNearbyCheckins(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const lat = parseFloat(url.searchParams.get("lat") || "0");
  const lng = parseFloat(url.searchParams.get("lng") || "0");
  const radius = Math.min(
    parseFloat(url.searchParams.get("radius") || "5"),
    50,
  ); // max 50km
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  if (!lat || !lng) {
    return new Response(
      JSON.stringify({ error: "lat and lng parameters required" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  // Get all checkins with coordinates
  const results = await sqlite.execute(
    `
    SELECT id, uri, author_did, author_handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins_v1
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY created_at DESC
    LIMIT ?
  `,
    [limit * 3],
  ); // Get more to filter by distance

  const rows = results.rows || [];

  // Calculate distances and filter
  const nearbyRows = rows
    .map((row) => {
      const distance = calculateDistance(
        lat,
        lng,
        row.latitude as number,
        row.longitude as number,
      );
      return { ...row, distance };
    })
    .filter((row) => row.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  // Resolve profiles for filtered results
  const dids = [
    ...new Set(nearbyRows.map((row: any) => row.author_did as string)),
  ];
  const storage = new SqliteStorageProvider(sqlite);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const nearbyCheckins = nearbyRows.map((row) => formatCheckin(row, profiles));

  return new Response(
    JSON.stringify({
      checkins: nearbyCheckins,
      center: { latitude: lat, longitude: lng },
      radius,
    }),
    { headers: corsHeaders },
  );
}

async function getUserCheckins(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const did = url.searchParams.get("did");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  if (!did) {
    return new Response(JSON.stringify({ error: "did parameter required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const results = await sqlite.execute(
    `
    SELECT id, uri, author_did, author_handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins_v1
    WHERE author_did = ?
    ORDER BY created_at DESC
    LIMIT ?
  `,
    [did, limit],
  );

  const rows = results.rows || [];

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.author_did as string))];
  const storage = new SqliteStorageProvider(sqlite);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const checkins = rows.map((row) => formatCheckin(row, profiles));

  return new Response(
    JSON.stringify({
      checkins,
      user: { did },
    }),
    { headers: corsHeaders },
  );
}

async function getFollowingFeed(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const userDid = url.searchParams.get("user");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const cursor = url.searchParams.get("cursor");

  if (!userDid) {
    return new Response(JSON.stringify({ error: "user parameter required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Get users this person follows
  const follows = await sqlite.execute(
    `
    SELECT following_did FROM user_follows_v1 WHERE follower_did = ?
  `,
    [userDid],
  );

  if (!follows.rows || follows.rows.length === 0) {
    return new Response(
      JSON.stringify({
        checkins: [],
        message: "No follows found for user",
      }),
      { headers: corsHeaders },
    );
  }

  const followingDids = follows.rows
    ? follows.rows.map((row) => row.following_did)
    : [];
  const placeholders = followingDids.map(() => "?").join(",");

  let query = `
    SELECT id, uri, author_did, author_handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins_v1
    WHERE author_did IN (${placeholders})
  `;

  const params: any[] = [...followingDids];

  if (cursor) {
    query += ` AND created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const results = await sqlite.execute(query, params);
  const rows = results.rows || [];

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.author_did as string))];
  const storage = new SqliteStorageProvider(sqlite);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const checkins = rows.map((row) => formatCheckin(row, profiles));

  return new Response(
    JSON.stringify({
      checkins,
      cursor: checkins.length > 0
        ? checkins[checkins.length - 1].createdAt
        : null,
      followingCount: followingDids.length,
    }),
    { headers: corsHeaders },
  );
}

async function getStats(corsHeaders: CorsHeaders): Promise<Response> {
  const [totalCheckins, totalUsers, recentActivity, processingStats] =
    await Promise.all([
      sqlite.execute(`SELECT COUNT(*) as count FROM checkins_v1`),
      sqlite.execute(
        `SELECT COUNT(DISTINCT author_did) as count FROM checkins_v1`,
      ),
      sqlite.execute(
        `SELECT COUNT(*) as count FROM checkins_v1 WHERE created_at > datetime('now', '-24 hours')`,
      ),
      sqlite.execute(
        `SELECT * FROM processing_log_v1 ORDER BY run_at DESC LIMIT 1`,
      ),
    ]);

  const stats = {
    totalCheckins: totalCheckins.rows?.[0]?.count || 0,
    totalUsers: totalUsers.rows?.[0]?.count || 0,
    recentActivity: recentActivity.rows?.[0]?.count || 0,
    lastProcessingRun: processingStats.rows?.[0] || null,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(stats), { headers: corsHeaders });
}

function formatCheckin(
  row: any,
  profiles: Map<string, ProfileData>,
): CheckinRecord {
  const profile = profiles.get(row.author_did as string);

  const checkin: any = {
    id: row.id,
    uri: row.uri,
    author: {
      did: row.author_did,
      handle: profile?.handle || row.author_handle || row.author_did,
      displayName: profile?.displayName,
      avatar: profile?.avatar,
    },
    text: row.text,
    createdAt: row.created_at,
  };

  // Add coordinates if available
  if (row.latitude && row.longitude) {
    checkin.coordinates = {
      latitude: row.latitude,
      longitude: row.longitude,
    };
  }

  // Add address if available
  if (row.cached_address_name || row.cached_address_street) {
    checkin.address = {
      name: row.cached_address_name,
      street: row.cached_address_street,
      locality: row.cached_address_locality,
      region: row.cached_address_region,
      country: row.cached_address_country,
      postalCode: row.cached_address_postal_code,
    };
  }

  // Add distance if calculated
  if (row.distance !== undefined) {
    checkin.distance = Math.round(row.distance * 100) / 100; // 2 decimal places
  }

  return checkin;
}

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Dashboard functions
async function getDashboardStats() {
  const [
    checkinsCount,
    usersCount,
    addressesResolved,
    addressesFailed,
    addressesTotal,
    recentCheckins,
    recentActivity,
    lastProcessingRun,
    checkinsWithAddresses,
  ] = await Promise.all([
    // Total check-ins
    sqlite.execute(`SELECT COUNT(*) as count FROM checkins_v1`),

    // Unique users
    sqlite.execute(
      `SELECT COUNT(DISTINCT author_did) as count FROM checkins_v1`,
    ),

    // Successfully resolved addresses
    sqlite.execute(
      `SELECT COUNT(*) as count FROM address_cache_v1 WHERE resolved_at IS NOT NULL`,
    ),

    // Failed address resolutions
    sqlite.execute(
      `SELECT COUNT(*) as count FROM address_cache_v1 WHERE failed_at IS NOT NULL`,
    ),

    // Total addresses in cache
    sqlite.execute(`SELECT COUNT(*) as count FROM address_cache_v1`),

    // Recent check-ins (last 5)
    sqlite.execute(`
      SELECT text, author_handle, created_at, cached_address_name 
      FROM checkins_v1 
      ORDER BY created_at DESC 
      LIMIT 5
    `),

    // Recent activity (24 hours)
    sqlite.execute(`
      SELECT COUNT(*) as count 
      FROM checkins_v1 
      WHERE created_at > datetime('now', '-24 hours')
    `),

    // Last processing run
    sqlite.execute(`
      SELECT * FROM processing_log_v1 
      ORDER BY run_at DESC 
      LIMIT 1
    `),

    // Check-ins with resolved addresses
    sqlite.execute(`
      SELECT COUNT(*) as count 
      FROM checkins_v1 
      WHERE address_resolved_at IS NOT NULL
    `),
  ]);

  return {
    totalCheckins: checkinsCount.rows?.[0]?.count || 0,
    totalUsers: usersCount.rows?.[0]?.count || 0,
    addressesResolved: addressesResolved.rows?.[0]?.count || 0,
    addressesFailed: addressesFailed.rows?.[0]?.count || 0,
    addressesTotal: addressesTotal.rows?.[0]?.count || 0,
    recentCheckins: recentCheckins.rows ? recentCheckins.rows : [],
    recentActivity: recentActivity.rows?.[0]?.count || 0,
    lastProcessingRun:
      lastProcessingRun.rows && lastProcessingRun.rows.length > 0
        ? lastProcessingRun.rows[0]
        : null,
    checkinsWithAddresses: checkinsWithAddresses.rows?.[0]?.count || 0,
    timestamp: new Date().toISOString(),
  };
}

function generateDashboardHTML(stats: any, url: URL): string {
  const addressResolutionRate = stats.totalCheckins > 0
    ? ((stats.checkinsWithAddresses / stats.totalCheckins) * 100).toFixed(1)
    : 0;

  // Check for login success message
  const loginSuccess = url.searchParams.get("login") === "success";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anchor AppView Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f8fafc;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header h1 {
            color: #1e293b;
            margin: 0 0 10px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #3b82f6;
            margin: 10px 0;
        }
        .stat-label {
            color: #64748b;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-detail {
            color: #64748b;
            font-size: 0.8em;
            margin-top: 5px;
        }
        .recent-section {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .recent-section h3 {
            margin-top: 0;
            color: #1e293b;
        }
        .checkin-item {
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .checkin-item:last-child {
            border-bottom: none;
        }
        .checkin-text {
            font-weight: 500;
            margin-bottom: 5px;
        }
        .checkin-meta {
            font-size: 0.8em;
            color: #64748b;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .footer a {
            color: #3b82f6;
            text-decoration: none;
            margin: 0 10px;
        }
        .footer a:hover {
            text-decoration: underline;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-active { background: #10b981; }
        .status-idle { background: #f59e0b; }
        .status-error { background: #ef4444; }
        .refresh-button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-left: 10px;
        }
        .refresh-button:hover {
            background: #2563eb;
        }
        .header-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
        }
        .login-link {
            background: #059669;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            font-size: 14px;
        }
        .login-link:hover {
            background: #047857;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚓ Anchor AppView Dashboard</h1>
        <p>Location-based check-ins feed generator for AT Protocol</p>
        <div class="header-actions">
            <p style="color: #64748b; font-size: 0.9em; margin: 0;">
                Last updated: ${new Date(stats.timestamp).toLocaleString()}
                <a href="/" class="refresh-button">Refresh</a>
            </p>
            ${
    !loginSuccess
      ? `
            <a href="/login" class="login-link">🔐 Login with Bluesky</a>
            `
      : `
            <span style="color: #059669; font-weight: 500; font-size: 14px;">✅ Authenticated</span>
            `
  }
        </div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Total Check-ins</div>
            <div class="stat-value">${stats.totalCheckins}</div>
            <div class="stat-detail">From ${stats.totalUsers} unique users</div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Addresses Resolved</div>
            <div class="stat-value">${stats.checkinsWithAddresses}</div>
            <div class="stat-detail">${addressResolutionRate}% resolution rate</div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Address Cache</div>
            <div class="stat-value">${stats.addressesResolved}</div>
            <div class="stat-detail">
                ${stats.addressesFailed} failed, ${stats.addressesTotal} total
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Recent Activity</div>
            <div class="stat-value">${stats.recentActivity}</div>
            <div class="stat-detail">Check-ins in last 24 hours</div>
        </div>
    </div>

    ${
    stats.lastProcessingRun
      ? `
    <div class="recent-section">
        <h3>
            <span class="status-indicator ${
        getProcessingStatus(stats.lastProcessingRun)
      }"></span>
            Last Processing Run
        </h3>
        <p><strong>Time:</strong> ${
        new Date(stats.lastProcessingRun.run_at).toLocaleString()
      }</p>
        <p><strong>Events Processed:</strong> ${stats.lastProcessingRun.events_processed}</p>
        <p><strong>Errors:</strong> ${stats.lastProcessingRun.errors}</p>
        <p><strong>Duration:</strong> ${stats.lastProcessingRun.duration_ms}ms</p>
    </div>
    `
      : `
    <div class="recent-section">
        <h3>
            <span class="status-indicator status-idle"></span>
            Processing Status
        </h3>
        <p>No processing runs yet. Jetstream poller may not be active.</p>
    </div>
    `
  }

    ${
    stats.recentCheckins.length > 0
      ? `
    <div class="recent-section">
        <h3>Recent Check-ins</h3>
        ${
        stats.recentCheckins.map((checkin: any) => `
            <div class="checkin-item">
                <div class="checkin-text">"${
          checkin.text || "No message"
        }"</div>
                <div class="checkin-meta">
                    By ${checkin.author_handle || "Unknown"} • 
                    ${new Date(checkin.created_at).toLocaleString()} • 
                    ${checkin.cached_address_name || "Address not resolved"}
                </div>
            </div>
        `).join("")
      }
    </div>
    `
      : `
    <div class="recent-section">
        <h3>Recent Check-ins</h3>
        <p>No check-ins found. System is waiting for data ingestion.</p>
    </div>
    `
  }

    <div class="footer">
        <h3>API Endpoints</h3>
        <a href="/global">Global Feed</a>
        <a href="/nearby?lat=52.3676&lng=4.9041&radius=5">Nearby (Amsterdam)</a>
        <a href="/stats">Stats JSON</a>
        <br><br>
        <p style="color: #64748b; font-size: 0.9em;">
            Anchor AppView • Powered by <a href="https://val.town">Val Town</a>
        </p>
    </div>

    <script>
        // Auto-refresh every 30 seconds (but not if we just logged in)
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('login')) {
            setTimeout(() => {
                window.location.reload();
            }, 30000);
        }
    </script>
</body>
</html>
  `;
}

function generateLoginHTML(url: URL): string {
  // Check for login success message
  const loginSuccess = url.searchParams.get("login") === "success";
  const loginHandle = url.searchParams.get("handle");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Anchor AppView</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        .header {
            margin-bottom: 30px;
        }
        .header h1 {
            color: #1e293b;
            margin: 0 0 10px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .login-form {
            display: flex;
            flex-direction: column;
            gap: 15px;
            align-items: center;
        }
        .login-input {
            padding: 12px 16px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 16px;
            width: 100%;
            max-width: 300px;
        }
        .login-button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            width: 100%;
            max-width: 300px;
        }
        .login-button:hover {
            background: #2563eb;
        }
        .login-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
        }
        .success-message {
            background: #d1fae5;
            border: 1px solid #10b981;
            color: #065f46;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .back-link {
            color: #3b82f6;
            text-decoration: none;
            margin-top: 20px;
            display: inline-block;
        }
        .back-link:hover {
            text-decoration: underline;
        }
        .description {
            color: #64748b;
            font-size: 0.9em;
            margin-bottom: 30px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="header">
            <h1>⚓ Anchor AppView</h1>
            <p class="description">Login with your Bluesky account to access personalized feeds</p>
        </div>

        ${
    loginSuccess
      ? `
        <div class="success-message">
            ✅ Successfully logged in as @${loginHandle}! OAuth authentication is now active.
        </div>
        <p style="color: #64748b; font-size: 0.9em; margin-bottom: 20px;">
            You can now access personalized feeds and check-ins from people you follow.
        </p>
        <a href="/" class="login-button" style="text-decoration: none; display: inline-block;">Go to Dashboard</a>
        `
      : `
        <div class="login-form">
            <input type="text" id="handleInput" class="login-input" placeholder="Enter your Bluesky handle (e.g., user.bsky.social)" />
            <button onclick="startOAuth()" class="login-button" id="loginButton">Login with Bluesky</button>
        </div>
        <p style="color: #64748b; font-size: 0.9em; margin-top: 15px;">
            We'll redirect you to your Bluesky server for secure authentication.
        </p>
        `
  }
        
        <a href="/" class="back-link">← Back to Dashboard</a>
    </div>

    <script>
        // OAuth login functionality
        async function startOAuth() {
            const handleInput = document.getElementById('handleInput');
            const loginButton = document.getElementById('loginButton');
            const handle = handleInput.value.trim();
            
            if (!handle) {
                alert('Please enter your Bluesky handle');
                return;
            }
            
            loginButton.disabled = true;
            loginButton.textContent = 'Starting OAuth...';
            
            try {
                const response = await fetch('/api/auth/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ handle }),
                });
                
                const data = await response.json();
                
                if (response.ok && data.authUrl) {
                    // Redirect to OAuth authorization
                    window.location.href = data.authUrl;
                } else {
                    alert('Failed to start OAuth: ' + (data.error || 'Unknown error'));
                    loginButton.disabled = false;
                    loginButton.textContent = 'Login with Bluesky';
                }
            } catch (error) {
                console.error('OAuth start error:', error);
                alert('Failed to start OAuth: ' + error.message);
                loginButton.disabled = false;
                loginButton.textContent = 'Login with Bluesky';
            }
        }
        
        // Handle Enter key in handle input
        document.addEventListener('DOMContentLoaded', function() {
            const handleInput = document.getElementById('handleInput');
            if (handleInput) {
                handleInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        startOAuth();
                    }
                });
                // Focus on the input field
                handleInput.focus();
            }
        });
    </script>
</body>
</html>
  `;
}

function getProcessingStatus(run: any): string {
  if (!run) return "status-idle";

  const lastRun = new Date(run.run_at);
  const now = new Date();
  const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);

  // If last run was within 10 minutes and had no errors, status is active
  if (minutesSinceLastRun < 10 && run.errors === 0) {
    return "status-active";
  }

  // If errors occurred, status is error
  if (run.errors > 0) {
    return "status-error";
  }

  // Otherwise, idle
  return "status-idle";
}
