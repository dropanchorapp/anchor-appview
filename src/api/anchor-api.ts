// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

// Types for better TypeScript support
interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
}

interface CheckinRecord {
  id: string;
  uri: string;
  author: {
    did: string;
    handle: string;
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

  const checkins = Array.isArray(results) ? results.map(formatCheckin) : [];

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

  // Calculate distances and filter
  const nearbyCheckins = Array.isArray(results)
    ? results
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
      .slice(0, limit)
      .map(formatCheckin)
    : [];

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

  const checkins = Array.isArray(results) ? results.map(formatCheckin) : [];

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

  if (follows.length === 0) {
    return new Response(
      JSON.stringify({
        checkins: [],
        message: "No follows found for user",
      }),
      { headers: corsHeaders },
    );
  }

  const followingDids = Array.isArray(follows)
    ? follows.map((row) => row.following_did)
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
  const checkins = Array.isArray(results) ? results.map(formatCheckin) : [];

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
    totalCheckins: totalCheckins[0]?.count || 0,
    totalUsers: totalUsers[0]?.count || 0,
    recentActivity: recentActivity[0]?.count || 0,
    lastProcessingRun: processingStats[0] || null,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(stats), { headers: corsHeaders });
}

function formatCheckin(row: any): CheckinRecord {
  const checkin: any = {
    id: row.id,
    uri: row.uri,
    author: {
      did: row.author_did,
      handle: row.author_handle || row.author_did,
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
