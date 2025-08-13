// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { db, initializeTables, rawDb } from "../database/db.ts";
import {
  checkinsTable,
  processingLogTable,
  userFollowsTable,
} from "../database/schema.ts";
import { and, desc, eq, inArray, lt, sql } from "https://esm.sh/drizzle-orm";
import { ATProtocolProfileResolver } from "../utils/profile-resolver.ts";
import {
  ProfileData,
  SqliteStorageProvider,
} from "../utils/storage-provider.ts";
import { OverpassService } from "../services/overpass-service.ts";
import { PlacesNearbyResponse } from "../models/place-models.ts";
import { createCheckin } from "./checkins.ts";
import { getCheckinCounts, getRecentActivity } from "../database/queries.ts";

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
      // Check for dynamic routes like /api/checkin/:id
      if (url.pathname.startsWith("/api/checkin/")) {
        const checkinId = url.pathname.split("/api/checkin/")[1];
        return await getCheckinById(checkinId, corsHeaders);
      }
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

  // Type-safe Drizzle query - no more field name confusion!
  const baseQuery = db.select({
    id: checkinsTable.id,
    uri: checkinsTable.uri,
    did: checkinsTable.did,
    handle: checkinsTable.handle,
    text: checkinsTable.text,
    createdAt: checkinsTable.createdAt,
    latitude: checkinsTable.latitude,
    longitude: checkinsTable.longitude,
    venueName: checkinsTable.venueName, // UNIFIED venue name field
    addressStreet: checkinsTable.addressStreet,
    addressLocality: checkinsTable.addressLocality,
    addressRegion: checkinsTable.addressRegion,
    addressCountry: checkinsTable.addressCountry,
    addressPostalCode: checkinsTable.addressPostalCode,
  }).from(checkinsTable);

  const rows = cursor
    ? await baseQuery
      .where(sql`${checkinsTable.createdAt} < ${cursor}`)
      .orderBy(desc(checkinsTable.createdAt))
      .limit(limit)
    : await baseQuery
      .orderBy(desc(checkinsTable.createdAt))
      .limit(limit);

  // Resolve profiles for all authors
  const dids = [...new Set(rows.map((row) => row.did))];
  const storage = new SqliteStorageProvider(rawDb); // Use rawDb not Drizzle db
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

  // Get all checkins with coordinates using type-safe Drizzle query
  const rows = await db.select({
    id: checkinsTable.id,
    uri: checkinsTable.uri,
    did: checkinsTable.did,
    handle: checkinsTable.handle,
    text: checkinsTable.text,
    createdAt: checkinsTable.createdAt,
    latitude: checkinsTable.latitude,
    longitude: checkinsTable.longitude,
    venueName: checkinsTable.venueName, // UNIFIED venue name field
    addressStreet: checkinsTable.addressStreet,
    addressLocality: checkinsTable.addressLocality,
    addressRegion: checkinsTable.addressRegion,
    addressCountry: checkinsTable.addressCountry,
    addressPostalCode: checkinsTable.addressPostalCode,
  }).from(checkinsTable)
    .where(and(
      sql`${checkinsTable.latitude} IS NOT NULL`,
      sql`${checkinsTable.longitude} IS NOT NULL`,
    ))
    .orderBy(desc(checkinsTable.createdAt))
    .limit(limit * 3); // Get more to filter by distance

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
  const storage = new SqliteStorageProvider(rawDb);
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

  const rows = await db.select({
    id: checkinsTable.id,
    uri: checkinsTable.uri,
    did: checkinsTable.did,
    handle: checkinsTable.handle,
    text: checkinsTable.text,
    createdAt: checkinsTable.createdAt,
    latitude: checkinsTable.latitude,
    longitude: checkinsTable.longitude,
    venueName: checkinsTable.venueName, // UNIFIED venue name field
    addressStreet: checkinsTable.addressStreet,
    addressLocality: checkinsTable.addressLocality,
    addressRegion: checkinsTable.addressRegion,
    addressCountry: checkinsTable.addressCountry,
    addressPostalCode: checkinsTable.addressPostalCode,
  }).from(checkinsTable)
    .where(eq(checkinsTable.did, did))
    .orderBy(desc(checkinsTable.createdAt))
    .limit(limit);

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.did))];
  const storage = new SqliteStorageProvider(rawDb);
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

  // Get users this person follows using type-safe Drizzle query
  const follows = await db.select({
    followingDid: userFollowsTable.followingDid,
  }).from(userFollowsTable)
    .where(eq(userFollowsTable.followerDid, userDid));

  if (follows.length === 0) {
    return new Response(
      JSON.stringify({
        checkins: [],
        message: "No follows found for user",
      }),
      { headers: corsHeaders },
    );
  }

  const followingDids = follows.map((row) => row.followingDid);

  // Get checkins from followed users using type-safe Drizzle query
  const baseFollowingQuery = db.select({
    id: checkinsTable.id,
    uri: checkinsTable.uri,
    did: checkinsTable.did,
    handle: checkinsTable.handle,
    text: checkinsTable.text,
    createdAt: checkinsTable.createdAt,
    latitude: checkinsTable.latitude,
    longitude: checkinsTable.longitude,
    venueName: checkinsTable.venueName, // UNIFIED venue name field
    addressStreet: checkinsTable.addressStreet,
    addressLocality: checkinsTable.addressLocality,
    addressRegion: checkinsTable.addressRegion,
    addressCountry: checkinsTable.addressCountry,
    addressPostalCode: checkinsTable.addressPostalCode,
  }).from(checkinsTable);

  const rows = cursor
    ? await baseFollowingQuery
      .where(and(
        inArray(checkinsTable.did, followingDids),
        lt(checkinsTable.createdAt, cursor),
      ))
      .orderBy(desc(checkinsTable.createdAt))
      .limit(limit)
    : await baseFollowingQuery
      .where(inArray(checkinsTable.did, followingDids))
      .orderBy(desc(checkinsTable.createdAt))
      .limit(limit);

  // Resolve profiles
  const dids = [...new Set(rows.map((row) => row.did))];
  const storage = new SqliteStorageProvider(rawDb);
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
  // Use shared query functions to eliminate duplication
  const [counts, recentActivity, processingStats] = await Promise.all([
    getCheckinCounts(),
    getRecentActivity(),
    db.select().from(processingLogTable)
      .orderBy(desc(processingLogTable.runAt))
      .limit(1),
  ]);

  const stats = {
    totalCheckins: counts.totalCheckins,
    totalUsers: counts.uniqueUsers,
    recentActivity,
    lastProcessingRun: processingStats[0] || null,
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
    createdAt: row.createdAt, // Fixed field name - Drizzle returns createdAt not created_at
  };

  // Add coordinates if available
  if (row.latitude && row.longitude) {
    checkin.coordinates = {
      latitude: row.latitude,
      longitude: row.longitude,
    };
  }

  // Add address if available - using unified venueName field (no more confusion!)
  if (
    row.venueName || row.addressStreet || row.addressLocality ||
    row.addressRegion || row.addressCountry || row.addressPostalCode
  ) {
    checkin.address = {
      name: row.venueName, // UNIFIED venue name field - always consistent
      street: row.addressStreet,
      locality: row.addressLocality,
      region: row.addressRegion,
      country: row.addressCountry,
      postalCode: row.addressPostalCode,
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
          street: nearestPlace.address?.street,
          locality: nearestPlace.address?.locality,
          region: nearestPlace.address?.region,
          country: nearestPlace.address?.country,
          postalCode: nearestPlace.address?.postalCode,
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

async function getCheckinById(
  checkinId: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    // Query for the specific checkin by id (rkey)
    const rows = await db.select({
      id: checkinsTable.id,
      uri: checkinsTable.uri,
      rkey: checkinsTable.rkey,
      did: checkinsTable.did,
      handle: checkinsTable.handle,
      displayName: checkinsTable.displayName,
      avatar: checkinsTable.avatar,
      text: checkinsTable.text,
      createdAt: checkinsTable.createdAt,
      latitude: checkinsTable.latitude,
      longitude: checkinsTable.longitude,
      venueName: checkinsTable.venueName,
      category: checkinsTable.category,
      categoryGroup: checkinsTable.categoryGroup,
      categoryIcon: checkinsTable.categoryIcon,
      addressStreet: checkinsTable.addressStreet,
      addressLocality: checkinsTable.addressLocality,
      addressRegion: checkinsTable.addressRegion,
      addressCountry: checkinsTable.addressCountry,
      addressPostalCode: checkinsTable.addressPostalCode,
    })
      .from(checkinsTable)
      .where(eq(checkinsTable.id, checkinId))
      .limit(1);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Checkin not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const row = rows[0];

    // Get profile data for the author
    const storage = new SqliteStorageProvider(rawDb);
    const profileResolver = new ATProtocolProfileResolver(storage);
    const profiles = await profileResolver.batchResolveProfiles([row.did]);

    // Convert to CheckinRecord format
    const checkin = await formatCheckinWithPlaces(row, profiles);

    return new Response(JSON.stringify(checkin), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Get checkin error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
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
