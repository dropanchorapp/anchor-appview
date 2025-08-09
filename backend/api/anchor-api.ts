// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { db, initializeTables } from "../database/db.ts";
import { ATProtocolProfileResolver } from "../utils/profile-resolver.ts";
import {
  ProfileData,
  SqliteStorageProvider,
} from "../utils/storage-provider.ts";

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
    FROM checkins
  `;

  const params: any[] = [];

  if (cursor) {
    query += ` WHERE created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const results = await db.execute(query, params);
  const rows = results.rows || [];

  // Resolve profiles for all authors
  const dids = [...new Set(rows.map((row) => row.author_did as string))];
  const storage = new SqliteStorageProvider(db);
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
  const results = await db.execute(
    `
    SELECT id, uri, author_did, author_handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins
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
  const storage = new SqliteStorageProvider(db);
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

  const results = await db.execute(
    `
    SELECT id, uri, author_did, author_handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins
    WHERE author_did = ?
    ORDER BY created_at DESC
    LIMIT ?
  `,
    [did, limit],
  );

  const rows = results.rows || [];

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.author_did as string))];
  const storage = new SqliteStorageProvider(db);
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
  const follows = await db.execute(
    `
    SELECT following_did FROM user_follows WHERE follower_did = ?
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
    FROM checkins
    WHERE author_did IN (${placeholders})
  `;

  const params: any[] = [...followingDids];

  if (cursor) {
    query += ` AND created_at < ?`;
    params.push(cursor);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const results = await db.execute(query, params);
  const rows = results.rows || [];

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.author_did as string))];
  const storage = new SqliteStorageProvider(db);
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
      db.execute(`SELECT COUNT(*) as count FROM checkins`),
      db.execute(
        `SELECT COUNT(DISTINCT author_did) as count FROM checkins`,
      ),
      db.execute(
        `SELECT COUNT(*) as count FROM checkins WHERE created_at > datetime('now', '-24 hours')`,
      ),
      db.execute(
        `SELECT * FROM processing_log ORDER BY run_at DESC LIMIT 1`,
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

  // Add address if available from strongref resolution
  if (
    row.cached_address_name || row.cached_address_street ||
    row.cached_address_locality || row.cached_address_region ||
    row.cached_address_country || row.cached_address_postal_code
  ) {
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
