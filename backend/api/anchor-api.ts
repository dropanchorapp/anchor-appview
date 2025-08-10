// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { db, initializeTables } from "../database/db.ts";
import { ATProtocolProfileResolver } from "../utils/profile-resolver.ts";
import {
  ProfileData,
  SqliteStorageProvider,
} from "../utils/storage-provider.ts";
import { OverpassService } from "../services/overpass-service.ts";
import { PlacesNearbyResponse } from "../models/place-models.ts";
import { createCheckin } from "./checkins.ts";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cookie",
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
    case "/api/global":
      return await getGlobalFeed(url, corsHeaders);
    case "/api/nearby":
      return await getNearbyCheckins(url, corsHeaders);
    case "/api/user":
      return await getUserCheckins(url, corsHeaders);
    case "/api/following":
      return await getFollowingFeed(url, corsHeaders);
    case "/api/places/nearby":
      return await getNearbyPlaces(url, corsHeaders);
    case "/api/stats":
      return await getStats(corsHeaders);
    case "/api/checkins":
      return await handleCreateCheckin(req, corsHeaders);
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
    SELECT id, uri, did, handle, text, created_at, 
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
  const dids = [...new Set(rows.map((row) => row.did as string))];
  const storage = new SqliteStorageProvider(db);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const checkins = await Promise.all(
    rows.map((row) => formatCheckinWithPlaces(row, profiles)),
  );

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
    SELECT id, uri, did, handle, text, created_at, 
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
    ...new Set(nearbyRows.map((row: any) => row.did as string)),
  ];
  const storage = new SqliteStorageProvider(db);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const nearbyCheckins = await Promise.all(
    nearbyRows.map((row) => formatCheckinWithPlaces(row, profiles)),
  );

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
    SELECT id, uri, did, handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins
    WHERE did = ?
    ORDER BY created_at DESC
    LIMIT ?
  `,
    [did, limit],
  );

  const rows = results.rows || [];

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.did as string))];
  const storage = new SqliteStorageProvider(db);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const checkins = await Promise.all(
    rows.map((row) => formatCheckinWithPlaces(row, profiles)),
  );

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
    SELECT id, uri, did, handle, text, created_at, 
           latitude, longitude, cached_address_name, cached_address_street,
           cached_address_locality, cached_address_region, cached_address_country,
           cached_address_postal_code, cached_address_full
    FROM checkins
    WHERE did IN (${placeholders})
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
  const dids = [...new Set(rows.map((row) => row.did as string))];
  const storage = new SqliteStorageProvider(db);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const checkins = await Promise.all(
    rows.map((row) => formatCheckinWithPlaces(row, profiles)),
  );

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
        `SELECT COUNT(DISTINCT did) as count FROM checkins`,
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

async function getNearbyPlaces(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const lat = parseFloat(url.searchParams.get("lat") || "0");
  const lng = parseFloat(url.searchParams.get("lng") || "0");
  const radius = Math.min(
    parseFloat(url.searchParams.get("radius") || "300"),
    2000, // max 2km for places search
  );
  const categoriesParam = url.searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",") : [];

  // Validate coordinates
  if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return new Response(
      JSON.stringify({
        error:
          "Valid lat and lng parameters required (lat: -90 to 90, lng: -180 to 180)",
      }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    // Initialize Overpass service
    const overpassService = new OverpassService();

    // Search for nearby places
    const placesWithDistance = await overpassService
      .findNearbyPlacesWithDistance(
        { latitude: lat, longitude: lng },
        radius,
        categories,
      );

    // Format response
    const response: PlacesNearbyResponse = {
      places: placesWithDistance,
      totalCount: placesWithDistance.length,
      searchRadius: radius,
      categories: categories.length > 0 ? categories : undefined,
      searchCoordinate: {
        latitude: lat,
        longitude: lng,
      },
    };

    return new Response(JSON.stringify(response), { headers: corsHeaders });
  } catch (error) {
    console.error("Places search error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to search for nearby places",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Create a single OverpassService instance to reuse
const overpassService = new OverpassService();

async function formatCheckinWithPlaces(
  row: any,
  profiles: Map<string, ProfileData>,
): Promise<CheckinRecord> {
  const profile = profiles.get(row.did as string);

  const checkin: any = {
    id: row.id,
    uri: row.uri,
    author: {
      did: row.did,
      handle: profile?.handle || row.handle || row.did,
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
  } else if (row.latitude && row.longitude) {
    // If no cached address data, try to find the nearest place via Overpass
    try {
      const nearbyPlaces = await overpassService.findNearbyPlaces(
        { latitude: row.latitude, longitude: row.longitude },
        100, // 100 meter radius
        [], // All categories
      );

      if (nearbyPlaces.length > 0) {
        // Use the first (closest) place found
        const nearestPlace = nearbyPlaces[0];
        checkin.address = {
          name: nearestPlace.name, // Use the actual venue name from OSM
          street: nearestPlace.tags?.["addr:street"] || undefined,
          locality: nearestPlace.tags?.["addr:city"] ||
            nearestPlace.tags?.["addr:locality"] || undefined,
          region: nearestPlace.tags?.["addr:state"] ||
            nearestPlace.tags?.["addr:province"] || undefined,
          country: nearestPlace.tags?.["addr:country"] || undefined,
          postalCode: nearestPlace.tags?.["addr:postcode"] || undefined,
        };
      }
    } catch (error) {
      console.warn("Failed to lookup nearby place:", error);
      // Continue without address data - this is non-critical
    }
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

async function handleCreateCheckin(
  req: Request,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  // Only handle POST requests for checkin creation
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Create a mock Hono Context for the createCheckin function
  const context = {
    req: {
      header: (name: string) => req.headers.get(name),
      json: () => req.json(),
    },
    json: (data: any, status?: number) =>
      new Response(JSON.stringify(data), {
        status: status || 200,
        headers: corsHeaders,
      }),
  };

  return await createCheckin(context as any);
}
