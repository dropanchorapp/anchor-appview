// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { initializeTables } from "../database/db.ts";
import { CategoryService } from "../services/category-service.ts";
import { NominatimService } from "../services/nominatim-service.ts";
import { PlacesNearbyResponse } from "../models/place-models.ts";
import { createCheckin } from "./checkins.ts";
import {
  exportUserData as exportUsers,
  getStatsResponse,
} from "../services/user-stats-service.ts";
import { createLike, getLikesForCheckin, removeLike } from "./likes.ts";
import {
  createComment,
  getCommentsForCheckin,
  removeComment,
} from "./comments.ts";
import { sessions } from "../routes/oauth.ts";
import { migrateUserCheckins } from "../services/checkin-migration-service.ts";

/**
 * Validates a checkin record against the current lexicon schema
 * Returns true if valid, false otherwise with console warning
 */
function _isValidCheckinRecord(record: any): boolean {
  if (!record.value) {
    console.warn(`⚠️ Invalid checkin ${record.uri}: missing value`);
    return false;
  }

  const value = record.value;

  // Check required fields according to app.dropanchor.checkin lexicon
  if (!value.text || typeof value.text !== "string") {
    console.warn(`⚠️ Invalid checkin ${record.uri}: missing or invalid text`);
    return false;
  }

  if (!value.createdAt || typeof value.createdAt !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing or invalid createdAt`,
    );
    return false;
  }

  // Validate coordinates structure
  if (!value.coordinates || typeof value.coordinates !== "object") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing or invalid coordinates object`,
    );
    return false;
  }

  // Coordinates must have both latitude and longitude
  // They should be strings (for DAG-CBOR compliance) that can be parsed as numbers
  const { latitude, longitude } = value.coordinates;

  if (!latitude || !longitude) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing latitude or longitude`,
    );
    return false;
  }

  // Check if coordinates are valid numbers (whether string or number type)
  const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
  const lng = typeof longitude === "string" ? parseFloat(longitude) : longitude;

  if (isNaN(lat) || isNaN(lng)) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: coordinates are not valid numbers (lat: ${latitude}, lng: ${longitude})`,
    );
    return false;
  }

  // Validate coordinate ranges
  if (lat < -90 || lat > 90) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: latitude out of range: ${lat}`,
    );
    return false;
  }

  if (lng < -180 || lng > 180) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: longitude out of range: ${lng}`,
    );
    return false;
  }

  // Validate addressRef if present (required field)
  if (!value.addressRef || typeof value.addressRef !== "object") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing or invalid addressRef`,
    );
    return false;
  }

  if (!value.addressRef.uri || !value.addressRef.cid) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: addressRef missing uri or cid`,
    );
    return false;
  }

  // Optional fields validation (if present, must be correct type)
  if (value.category && typeof value.category !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: category must be a string`,
    );
    return false;
  }

  if (value.categoryGroup && typeof value.categoryGroup !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: categoryGroup must be a string`,
    );
    return false;
  }

  if (value.categoryIcon && typeof value.categoryIcon !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: categoryIcon must be a string`,
    );
    return false;
  }

  if (value.image && typeof value.image !== "object") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: image must be an object`,
    );
    return false;
  }

  return true;
}

// Types for better TypeScript support
interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

interface Profile {
  handle?: string;
  displayName?: string;
  avatar?: string;
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
    case "/api/migrate-checkins":
      if (req.method === "POST") {
        return await handleMigrateCheckins(req, corsHeaders);
      }
      break;
    case "/api/places/nearby":
      return await getNearbyPlaces(url, corsHeaders);
    case "/api/places/search":
      return await searchPlaces(url, corsHeaders);
    case "/api/places/categories":
      return getPlaceCategories(corsHeaders);
    case "/api/stats":
      return await getStats(corsHeaders);
    case "/api/stats/export":
      return await getUserDataExport(corsHeaders);
    case "/api/user":
      return await getUserCheckins(req, corsHeaders);
    default: {
      // Handle likes endpoints: /api/checkins/:identifier/:rkey/likes
      // identifier can be either a DID or a handle
      const likesMatch = url.pathname.match(
        /^\/api\/checkins\/([^\/]+)\/([^\/]+)\/likes$/,
      );
      if (likesMatch) {
        const [, identifier, rkey] = likesMatch;

        // For GET requests, resolve identifier to DID
        if (req.method === "GET") {
          let did = identifier;
          if (!identifier.startsWith("did:")) {
            const resolvedDid = await resolveHandleToDid(identifier);
            if (!resolvedDid) {
              return new Response(
                JSON.stringify({
                  error: `Failed to resolve handle: ${identifier}`,
                }),
                {
                  status: 400,
                  headers: corsHeaders,
                },
              );
            }
            did = resolvedDid;
          }
          return await getLikesForCheckin(did, rkey, corsHeaders);
        }

        if (req.method === "POST") {
          return await handleCreateLike(identifier, rkey, req, corsHeaders);
        }

        if (req.method === "DELETE") {
          return await handleRemoveLike(identifier, rkey, req, corsHeaders);
        }
      }

      // Handle comments endpoints: /api/checkins/:identifier/:rkey/comments
      // identifier can be either a DID or a handle
      const commentsMatch = url.pathname.match(
        /^\/api\/checkins\/([^\/]+)\/([^\/]+)\/comments$/,
      );
      if (commentsMatch) {
        const [, identifier, rkey] = commentsMatch;

        // For GET requests, resolve identifier to DID
        if (req.method === "GET") {
          let did = identifier;
          if (!identifier.startsWith("did:")) {
            const resolvedDid = await resolveHandleToDid(identifier);
            if (!resolvedDid) {
              return new Response(
                JSON.stringify({
                  error: `Failed to resolve handle: ${identifier}`,
                }),
                {
                  status: 400,
                  headers: corsHeaders,
                },
              );
            }
            did = resolvedDid;
          }
          return await getCommentsForCheckin(did, rkey, corsHeaders);
        }

        if (req.method === "POST") {
          return await handleCreateComment(identifier, rkey, req, corsHeaders);
        }

        if (req.method === "DELETE") {
          return await handleRemoveComment(identifier, rkey, req, corsHeaders);
        }
      }

      // Handle DELETE /api/checkins/:did/:rkey (authenticated endpoint)
      if (req.method === "DELETE") {
        const deleteMatch = url.pathname.match(
          /^\/api\/checkins\/([^\/]+)\/([^\/]+)$/,
        );
        if (deleteMatch) {
          const [, did, rkey] = deleteMatch;
          return await deleteCheckin(did, rkey, req, corsHeaders);
        }
      }
      // Handle POST /api/checkins (create checkin)
      if (url.pathname === "/api/checkins" && req.method === "POST") {
        return await handleCreateCheckin(req, corsHeaders);
      }

      // Handle GET /api/checkins/:did/:rkey (get specific checkin)
      const checkinMatch = url.pathname.match(
        /^\/api\/checkins\/([^\/]+)\/([^\/]+)$/,
      );
      if (checkinMatch) {
        const [, did, rkey] = checkinMatch;
        return await getCheckinByDidAndRkey(did, rkey, corsHeaders);
      }

      // Handle GET /api/checkins/:did (get user checkins)
      const userCheckinsMatch = url.pathname.match(
        /^\/api\/checkins\/([^\/]+)$/,
      );
      if (userCheckinsMatch) {
        const [, did] = userCheckinsMatch;
        return await getUserCheckinsByDid(did, corsHeaders);
      }

      // Legacy /api/checkin/:id route for backward compatibility
      if (url.pathname.startsWith("/api/checkin/")) {
        const checkinId = url.pathname.split("/api/checkin/")[1];
        return await getCheckinById(checkinId, corsHeaders);
      }

      // Legacy /api/user/:identifier route handled by main.tsx redirect

      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }
  }
}

// Unused database-dependent functions removed - PDS-only architecture

async function getStats(corsHeaders: CorsHeaders): Promise<Response> {
  try {
    const statsResponse = await getStatsResponse();

    if (statsResponse.success && statsResponse.data) {
      return new Response(JSON.stringify(statsResponse), {
        headers: corsHeaders,
      });
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: statsResponse.error || "Failed to generate user statistics",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }
  } catch (error) {
    console.error("Stats endpoint error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
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
  const providerParam = url.searchParams.get("provider") || "overpass";

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
    // Get provider instance
    const { PlaceProviderFactory } = await import(
      "../services/places-provider.ts"
    );
    const provider = await PlaceProviderFactory.create(providerParam);

    console.log(`📍 Using places provider: ${provider.name}`);

    // Search for nearby places
    const placesWithDistance = await provider.findNearbyPlacesWithDistance(
      { latitude: lat, longitude: lng },
      radius,
      categories,
    );

    // Map backend PlaceWithDistance to API format (distanceMeters -> distance)
    const apiPlaces = placesWithDistance.map((place) => ({
      ...place,
      distance: place.distanceMeters, // Map distanceMeters to distance for mobile client
      // Remove distanceMeters to avoid confusion
      distanceMeters: undefined,
    }));

    // Format response
    const response: PlacesNearbyResponse = {
      places: apiPlaces,
      radius: radius, // Changed from searchRadius to radius for mobile client
      center: {
        latitude: lat,
        longitude: lng,
      },
      provider: provider.name, // Include provider name in response
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

function getPlaceCategories(corsHeaders: CorsHeaders): Response {
  try {
    // Get all category data for mobile app consumption
    const categories = CategoryService.getAllCategoryObjects();
    const defaultSearchCategories = CategoryService
      .getDefaultSearchCategories();
    const sociallyRelevantCategories = CategoryService
      .getSociallyRelevantCategories();

    const response = {
      categories,
      defaultSearch: defaultSearchCategories,
      sociallyRelevant: sociallyRelevantCategories,
      metadata: {
        totalCategories: categories.length,
        defaultSearchCount: defaultSearchCategories.length,
        sociallyRelevantCount: sociallyRelevantCategories.length,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Error fetching place categories:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch place categories",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Create service instances to reuse
const nominatimService = new NominatimService();

async function searchPlaces(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  // Parse and validate parameters
  const query = url.searchParams.get("q");
  const lat = parseFloat(url.searchParams.get("lat") || "0");
  const lng = parseFloat(url.searchParams.get("lng") || "0");
  const country = url.searchParams.get("country");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "10"),
    25, // max 25 results
  );

  // Validate required parameters
  if (!query || query.trim() === "") {
    return new Response(
      JSON.stringify({ error: "Query parameter 'q' is required" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  if (!lat || !lng || lat === 0 || lng === 0) {
    return new Response(
      JSON.stringify({
        error: "Valid latitude and longitude parameters are required",
      }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  // Validate coordinate ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(
      JSON.stringify({ error: "Invalid latitude or longitude values" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    console.log(
      `Searching places: "${query}" near ${lat}, ${lng} (country: ${
        country || "any"
      })`,
    );

    // Search for places using Nominatim
    const places = await nominatimService.searchPlaces(
      query.trim(),
      { latitude: lat, longitude: lng },
      {
        country,
        limit,
        radiusKm: 2, // 2km search radius for 4x4km box as requested
      },
    );

    console.log(`Found ${places.length} places for query: "${query}"`);

    // Format response to match the existing places API structure
    const response = {
      places,
      query,
      center: {
        latitude: lat,
        longitude: lng,
      },
      radius: 2000, // 2km in meters
      count: places.length,
    };

    return new Response(JSON.stringify(response), { headers: corsHeaders });
  } catch (error) {
    console.error("Places search error:", error);
    const errorResponse = {
      error: "Failed to search for places",
      details: error instanceof Error ? error.message : "Unknown error",
    };

    // Return appropriate status code based on error type
    const status =
      error instanceof Error && error.message.includes("Rate limit")
        ? 429
        : 500;

    return new Response(JSON.stringify(errorResponse), {
      status,
      headers: corsHeaders,
    });
  }
}

async function getCheckinById(
  checkinId: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    // Parse the checkin ID to extract AT URI
    let atUri: string;
    let did: string;
    let rkey: string;

    // Try to decode base64 encoded AT URI first
    try {
      atUri = atob(checkinId);
      const match = atUri.match(
        /at:\/\/(did:[^\/]+)\/app\.dropanchor\.checkin\/(.+)/,
      );
      if (match) {
        [, did, rkey] = match;
      } else {
        throw new Error("Invalid AT URI format");
      }
    } catch {
      // Fallback: try to parse as did_rkey format
      const parts = checkinId.split("_");
      if (parts.length === 2 && parts[0].startsWith("did:")) {
        did = parts[0];
        rkey = parts[1];
        atUri = `at://${did}/app.dropanchor.checkin/${rkey}`;
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid checkin ID format" }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
    }

    // Resolve the PDS URL for this DID
    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return new Response(
        JSON.stringify({ error: "Could not resolve PDS for user" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Fetch the check-in record from PDS (public endpoint, no auth needed)
    const checkinResponse = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.dropanchor.checkin&rkey=${rkey}`,
    );

    if (!checkinResponse.ok) {
      if (checkinResponse.status === 404) {
        return new Response(JSON.stringify({ error: "Checkin not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }
      throw new Error(`Failed to fetch checkin: ${checkinResponse.status}`);
    }

    const checkinData = await checkinResponse.json();

    // Resolve profile data for the checkin author
    const profileData = await resolveProfileFromPds(did);

    // Build the response object
    // Parse string coordinates back to numbers for API response
    const rawCoords = checkinData.value.coordinates;
    const coordinates = {
      latitude: parseFloat(rawCoords.latitude),
      longitude: parseFloat(rawCoords.longitude),
    };

    const checkin: any = {
      id: rkey,
      uri: atUri,
      author: {
        did: did,
        handle: profileData?.handle || did,
        displayName: profileData?.displayName,
        avatar: profileData?.avatar,
      },
      text: checkinData.value.text,
      createdAt: checkinData.value.createdAt,
      coordinates,
    };

    // Resolve address if addressRef exists
    if (checkinData.value.addressRef) {
      try {
        const addressRkey = checkinData.value.addressRef.uri.split("/").pop();
        const addressResponse = await fetch(
          `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=community.lexicon.location.address&rkey=${addressRkey}`,
        );

        if (addressResponse.ok) {
          const addressData = await addressResponse.json();
          checkin.address = addressData.value;
        }
      } catch (err) {
        console.warn("Failed to resolve address for checkin:", atUri, err);
      }
    }

    // Add image URLs if image exists
    if (checkinData.value.image) {
      const thumbCid = checkinData.value.image.thumb.ref.$link;
      const fullsizeCid = checkinData.value.image.fullsize.ref.$link;

      checkin.image = {
        thumbUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${thumbCid}`,
        fullsizeUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${fullsizeCid}`,
        alt: checkinData.value.image.alt,
      };
    }

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

async function getUserDataExport(corsHeaders: CorsHeaders): Promise<Response> {
  try {
    const users = await exportUsers();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          users,
          totalUsers: users.length,
          exportedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("User data export error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to export user data",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Helper function to resolve PDS URL from DID
export async function resolvePdsUrl(did: string): Promise<string | null> {
  try {
    // For bsky.social DIDs, use the main PDS
    if (did.includes("bsky.social")) {
      return "https://bsky.social";
    }

    // For other DIDs, resolve from DID document
    const didResponse = await fetch(`https://plc.directory/${did}`);
    if (!didResponse.ok) {
      throw new Error(`Failed to resolve DID: ${didResponse.status}`);
    }

    const didDoc = await didResponse.json();
    const pdsEndpoint = didDoc.service?.find((s: any) =>
      s.id === "#atproto_pds" && s.type === "AtprotoPersonalDataServer"
    );

    return pdsEndpoint?.serviceEndpoint || null;
  } catch (error) {
    console.error(`Failed to resolve PDS for DID ${did}:`, error);
    return null;
  }
}

export async function resolveHandleToDid(
  handle: string,
): Promise<string | null> {
  try {
    // Normalize handle (remove @ if present)
    const normalizedHandle = handle.startsWith("@") ? handle.slice(1) : handle;

    // Try resolving via Slingshot resolver first
    try {
      const slingshotResponse = await fetch(
        `https://slingshot.microcosm.blue/api/v1/resolve-handle/${
          encodeURIComponent(normalizedHandle)
        }`,
      );
      if (slingshotResponse.ok) {
        const data = await slingshotResponse.json();
        if (data.did) {
          return data.did;
        }
      }
    } catch (slingshotError) {
      console.warn(
        "Slingshot resolver failed, falling back to bsky.social:",
        slingshotError,
      );
    }

    // Fallback to bsky.social resolver
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${normalizedHandle}`,
    );
    if (response.ok) {
      const data = await response.json();
      return data.did || null;
    }

    return null;
  } catch (error) {
    console.error("Failed to resolve handle to DID:", error);
    return null;
  }
}

export async function resolveProfileFromPds(did: string): Promise<
  {
    handle?: string;
    displayName?: string;
    avatar?: string;
    description?: string;
  } | null
> {
  try {
    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return null;
    }

    // Fetch profile record from PDS
    const response = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.bsky.actor.profile&rkey=self`,
    );

    if (!response.ok) {
      return null;
    }

    const profileData = await response.json();
    const profile = profileData.value;

    // Also try to get the handle from the DID document
    let handle = did; // fallback to DID
    try {
      const didResponse = await fetch(`https://plc.directory/${did}`);
      if (didResponse.ok) {
        const didDoc = await didResponse.json();
        const handleAlias = didDoc.alsoKnownAs?.find((alias: string) =>
          alias.startsWith("at://")
        );
        if (handleAlias) {
          handle = handleAlias.replace("at://", "");
        }
      }
    } catch (error) {
      console.warn("Failed to resolve handle from DID:", error);
    }

    // Handle avatar blob reference
    let avatarUrl: string | undefined;
    if (profile?.avatar) {
      if (typeof profile.avatar === "string") {
        // Already a URL
        avatarUrl = profile.avatar;
      } else if (profile.avatar.ref && typeof profile.avatar.ref === "object") {
        // It's a blob reference - construct the URL
        const blobRef = profile.avatar.ref.$link || profile.avatar.ref;
        if (blobRef) {
          avatarUrl =
            `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${blobRef}`;
        }
      }
    }

    return {
      handle,
      displayName: profile?.displayName,
      avatar: avatarUrl,
      description: profile?.description,
    };
  } catch (error) {
    console.error("Failed to resolve profile:", error);
    return null;
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

// New PDS-based endpoint to get user's own check-ins
async function getUserCheckins(
  req: Request,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    const url = new URL(req.url);
    let userDid = url.searchParams.get("did");
    const identifier = url.searchParams.get("identifier");

    // If we have an identifier, determine if it's a DID or handle
    if (identifier && !userDid) {
      if (identifier.startsWith("did:")) {
        userDid = identifier;
      } else {
        // It's a handle, resolve to DID
        userDid = await resolveHandleToDid(identifier);
        if (!userDid) {
          return new Response(
            JSON.stringify({ error: "Could not resolve handle to DID" }),
            {
              status: 404,
              headers: corsHeaders,
            },
          );
        }
      }
    }

    // If no DID provided, get from authenticated session
    if (!userDid) {
      const { unsealData } = await import("npm:iron-session@8.0.4");

      const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
        "anchor-default-secret-for-development-only";

      // Extract cookie value and unseal it to get session data
      const cookieHeader = req.headers.get("cookie");
      if (!cookieHeader || !cookieHeader.includes("sid=")) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: corsHeaders,
          },
        );
      }

      const sessionCookie = cookieHeader
        .split(";")
        .find((c) => c.trim().startsWith("sid="))
        ?.split("=")[1];

      if (!sessionCookie) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: corsHeaders,
          },
        );
      }

      let sessionData: any;
      try {
        sessionData = await unsealData(decodeURIComponent(sessionCookie), {
          password: COOKIE_SECRET,
        });
      } catch (_err) {
        return new Response(JSON.stringify({ error: "Invalid session" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      if (!sessionData.userId) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          {
            status: 401,
            headers: corsHeaders,
          },
        );
      }

      userDid = sessionData.userId;
    }

    // Always use public PDS access since check-ins are public data
    const targetDid = url.searchParams.get("did") || userDid;
    if (!targetDid) {
      return new Response(
        JSON.stringify({ error: "No DID provided and user not authenticated" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const pdsUrl = await resolvePdsUrl(targetDid);
    if (!pdsUrl) {
      return new Response(
        JSON.stringify({ error: "Could not resolve PDS for user" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Parse query parameters
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50"),
      100,
    );
    const cursor = url.searchParams.get("cursor");

    // Fetch check-ins directly from user's PDS (always public access)
    let listRecordsUrl =
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${targetDid}&collection=app.dropanchor.checkin&limit=${limit}`;
    if (cursor) {
      listRecordsUrl += `&cursor=${cursor}`;
    }

    const response = await fetch(listRecordsUrl);

    if (!response.ok) {
      console.error(
        "Failed to fetch check-ins from PDS:",
        response.status,
        await response.text(),
      );
      return new Response(
        JSON.stringify({ error: "Failed to fetch check-ins" }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    const data = await response.json();

    // Resolve profile data once for the user
    const profileData = await resolveProfileFromPds(targetDid);

    // Format the check-ins for API response
    const checkins = await Promise.all(
      data.records.map(async (record: any) => {
        // Extract basic info from the record
        const rkey = record.uri.split("/").pop(); // Extract rkey from AT URI

        // Parse string coordinates back to numbers for API response
        const rawCoords = record.value.coordinates;
        const coordinates = {
          latitude: parseFloat(rawCoords.latitude),
          longitude: parseFloat(rawCoords.longitude),
        };

        const checkin: any = {
          id: rkey, // Use simple rkey for cleaner URLs
          uri: record.uri,
          author: {
            did: targetDid,
            handle: profileData?.handle || targetDid,
            displayName: profileData?.displayName,
            avatar: profileData?.avatar,
          },
          text: record.value.text,
          createdAt: record.value.createdAt,
          coordinates,
        };

        // Resolve address if addressRef exists
        if (record.value.addressRef) {
          try {
            const addressResponse = await fetch(
              `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${targetDid}&collection=community.lexicon.location.address&rkey=${
                record.value.addressRef.uri.split("/").pop()
              }`,
            );

            if (addressResponse.ok) {
              const addressData = await addressResponse.json();
              checkin.address = addressData.value;
            }
          } catch (err) {
            console.warn(
              "Failed to resolve address for checkin:",
              record.uri,
              err,
            );
          }
        }

        // Add image URLs if image exists
        if (record.value.image) {
          const thumbCid = record.value.image.thumb.ref.$link;
          const fullsizeCid = record.value.image.fullsize.ref.$link;

          checkin.image = {
            thumbUrl:
              `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${targetDid}&cid=${thumbCid}`,
            fullsizeUrl:
              `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${targetDid}&cid=${fullsizeCid}`,
            alt: record.value.image.alt,
          };
        }

        return checkin;
      }),
    );

    return new Response(
      JSON.stringify({
        checkins,
        cursor: data.cursor,
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Get my checkins error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// New REST-style handlers

// GET /api/checkins/:did - Get all checkins for a specific user
async function getUserCheckinsByDid(
  did: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    // Validate DID format
    if (!did.startsWith("did:")) {
      // Maybe it's a handle, try to resolve it
      const resolvedDid = await resolveHandleToDid(did);
      if (resolvedDid) {
        did = resolvedDid;
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid DID or handle" }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
    }

    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return new Response(
        JSON.stringify({ error: "Could not resolve PDS for user" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Fetch check-ins directly from user's PDS
    const listRecordsUrl =
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.dropanchor.checkin&limit=50`;

    const response = await fetch(listRecordsUrl);
    if (!response.ok) {
      console.error(
        "Failed to fetch check-ins from PDS:",
        response.status,
        await response.text(),
      );
      return new Response(
        JSON.stringify({ error: "Failed to fetch check-ins" }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    const data = await response.json();

    // Handle case where user has no checkins yet
    if (!data.records || data.records.length === 0) {
      return new Response(
        JSON.stringify({ checkins: [] }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    // Auto-migrate numeric coordinates in background if needed
    const needsMigration = data.records.some((r: any) =>
      typeof r.value?.coordinates?.latitude === "number" ||
      typeof r.value?.coordinates?.longitude === "number"
    );

    if (needsMigration) {
      const oauthSession = await sessions.getOAuthSession(did);
      if (oauthSession) {
        migrateUserCheckins(oauthSession).catch(() => {}); // silent background migration
      }
    }

    // Use all records, not just valid ones - the parsing handles both strings and numbers
    if (data.records.length === 0) {
      console.log(`✅ No checkins found for ${did}`);
      return new Response(
        JSON.stringify({ checkins: [] }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    // Resolve profile data once for the user
    const profileData = await resolveProfileFromPds(did);

    const checkins = await Promise.all(
      data.records.map(async (record: any) => {
        const rkey = record.uri.split("/").pop(); // Extract rkey from AT URI

        // Parse coordinates to numbers for API response (handles both strings and numbers)
        const rawCoords = record.value?.coordinates;
        if (!rawCoords || !rawCoords.latitude || !rawCoords.longitude) {
          console.warn(`⚠️ Skipping checkin ${rkey} with missing coordinates`);
          return null;
        }

        const coordinates = {
          latitude: typeof rawCoords.latitude === "number"
            ? rawCoords.latitude
            : parseFloat(rawCoords.latitude),
          longitude: typeof rawCoords.longitude === "number"
            ? rawCoords.longitude
            : parseFloat(rawCoords.longitude),
        };

        // Validate parsed coordinates
        if (isNaN(coordinates.latitude) || isNaN(coordinates.longitude)) {
          console.warn(
            `⚠️ Skipping checkin ${rkey} with invalid coordinates: ${rawCoords.latitude}, ${rawCoords.longitude}`,
          );
          return null;
        }

        const checkin: any = {
          id: rkey, // Use simple rkey for cleaner URLs
          uri: record.uri,
          author: {
            did: did,
            handle: profileData?.handle || did,
            displayName: profileData?.displayName,
            avatar: profileData?.avatar,
          },
          text: record.value.text,
          createdAt: record.value.createdAt,
          coordinates,
        };

        // Resolve address if addressRef exists
        if (record.value.addressRef) {
          try {
            const addressResponse = await fetch(
              `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=community.lexicon.location.address&rkey=${
                record.value.addressRef.uri.split("/").pop()
              }`,
            );

            if (addressResponse.ok) {
              const addressData = await addressResponse.json();
              checkin.address = addressData.value;
            }
          } catch (err) {
            console.warn(
              "Failed to resolve address for checkin:",
              record.uri,
              err,
            );
          }
        }

        // Add image URLs if image exists
        if (record.value.image) {
          const thumbCid = record.value.image.thumb.ref.$link;
          const fullsizeCid = record.value.image.fullsize.ref.$link;

          checkin.image = {
            thumbUrl:
              `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${thumbCid}`,
            fullsizeUrl:
              `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${fullsizeCid}`,
            alt: record.value.image.alt,
          };
        }

        return checkin;
      }),
    );

    // Filter out null values (records that failed validation)
    const validCheckins = checkins.filter((c) => c !== null);

    return new Response(
      JSON.stringify({
        checkins: validCheckins,
        cursor: data.cursor,
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Get user checkins error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// GET /api/checkins/:identifier/:rkey - Get a specific checkin (identifier can be DID or handle)
async function getCheckinByDidAndRkey(
  identifier: string,
  rkey: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    // Resolve identifier to DID (handle if it doesn't start with "did:", otherwise use as-is)
    let did: string;
    if (identifier.startsWith("did:")) {
      did = identifier;
    } else {
      // Treat as handle and resolve to DID
      const resolvedDid = await resolveHandleToDid(identifier);
      if (!resolvedDid) {
        return new Response(
          JSON.stringify({ error: "Could not resolve handle to DID" }),
          {
            status: 404,
            headers: corsHeaders,
          },
        );
      }
      did = resolvedDid;
    }

    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return new Response(
        JSON.stringify({ error: "Could not resolve PDS for user" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Fetch the check-in record from PDS
    const checkinResponse = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.dropanchor.checkin&rkey=${rkey}`,
    );

    if (!checkinResponse.ok) {
      if (checkinResponse.status === 404) {
        return new Response(JSON.stringify({ error: "Checkin not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }
      throw new Error(`Failed to fetch checkin: ${checkinResponse.status}`);
    }

    const checkinData = await checkinResponse.json();

    // Resolve profile data for the checkin author
    const profileData = await resolveProfileFromPds(did);

    // Build the response object
    // Parse string coordinates back to numbers for API response
    const rawCoords = checkinData.value.coordinates;
    const coordinates = {
      latitude: parseFloat(rawCoords.latitude),
      longitude: parseFloat(rawCoords.longitude),
    };

    const checkin: any = {
      id: rkey,
      uri: `at://${did}/app.dropanchor.checkin/${rkey}`,
      author: {
        did: did,
        handle: profileData?.handle || did,
        displayName: profileData?.displayName,
        avatar: profileData?.avatar,
      },
      text: checkinData.value.text,
      createdAt: checkinData.value.createdAt,
      coordinates,
    };

    // Resolve address if addressRef exists
    if (checkinData.value.addressRef) {
      try {
        const addressRkey = checkinData.value.addressRef.uri.split("/").pop();
        const addressResponse = await fetch(
          `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=community.lexicon.location.address&rkey=${addressRkey}`,
        );

        if (addressResponse.ok) {
          const addressData = await addressResponse.json();
          checkin.address = addressData.value;
        }
      } catch (err) {
        console.warn(
          "Failed to resolve address for checkin:",
          checkin.uri,
          err,
        );
      }
    }

    // Add image URLs if image exists
    if (checkinData.value.image) {
      const thumbCid = checkinData.value.image.thumb.ref.$link;
      const fullsizeCid = checkinData.value.image.fullsize.ref.$link;

      checkin.image = {
        thumbUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${thumbCid}`,
        fullsizeUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${fullsizeCid}`,
        alt: checkinData.value.image.alt,
      };
    }

    return new Response(JSON.stringify(checkin), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Get checkin by DID and rkey error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function deleteCheckin(
  did: string,
  rkey: string,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check authentication - only the owner can delete their checkin
    const cookieHeader = req.headers.get("cookie");
    console.log("DELETE request - Cookie header:", cookieHeader);

    if (!cookieHeader || !cookieHeader.includes("sid=")) {
      console.log("DELETE request - No valid session cookie found");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    const sessionCookie = cookieHeader
      .split(";")
      .find((c) => c.trim().startsWith("sid="))
      ?.split("=")[1];

    console.log(
      "DELETE request - Session cookie extracted:",
      sessionCookie ? "Found" : "Not found",
    );

    if (!sessionCookie) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    // Get session data using iron-session
    const { unsealData } = await import("npm:iron-session@8.0.4");
    const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
      "anchor-default-secret-for-development-only";

    console.log("DELETE request - About to unseal session data");
    let sessionData: any;
    try {
      sessionData = await unsealData(decodeURIComponent(sessionCookie), {
        password: COOKIE_SECRET,
      });
      console.log("DELETE request - Session unsealed successfully");
      console.log(
        "DELETE request - Session data keys:",
        Object.keys(sessionData || {}),
      );
      console.log(
        "DELETE request - Full session data:",
        JSON.stringify(sessionData, null, 2),
      );
      console.log("DELETE request - userId field:", sessionData?.userId);
      console.log("DELETE request - did field:", sessionData?.did);
      console.log("DELETE request - sub field:", sessionData?.sub);
    } catch (err) {
      console.log("DELETE request - Session unseal failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // The session might have different structure - let's check for common user identifier fields
    const userDid = sessionData?.did || sessionData?.userId || sessionData?.sub;

    if (!userDid) {
      console.log("DELETE request - No user identifier found in session data");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    console.log(
      "DELETE request - Session validation passed, checking DID ownership",
    );

    // Verify that the authenticated user owns the checkin
    console.log("DELETE request - Comparing DID ownership:", {
      sessionUserDid: userDid,
      targetDid: did,
    });
    if (userDid !== did) {
      console.log("DELETE request - DID ownership check failed");
      return new Response(
        JSON.stringify({
          error: "Forbidden: Can only delete your own checkins",
        }),
        {
          status: 403,
          headers: corsHeaders,
        },
      );
    }

    console.log(
      "DELETE request - DID ownership confirmed, proceeding with deletion",
    );

    // Get user's PDS URL
    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return new Response(
        JSON.stringify({ error: "Could not resolve PDS for user" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Get the stored OAuth session data for API access
    let oauthSession = await sessions.getOAuthSession(did);
    if (!oauthSession) {
      console.log(`DELETE request - No OAuth session found for ${did}`);
      return new Response(
        JSON.stringify({ error: "OAuth session not found" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    console.log(
      `DELETE request - OAuth session found, attempting to delete from PDS: ${pdsUrl}`,
    );
    console.log(
      `DELETE request - OAuth session structure:`,
      JSON.stringify(oauthSession, null, 2),
    );

    // Check if this is a DPoP token (has DPoP keys)
    const sessionAny = oauthSession as any;

    // Extract the access token from the correct location (data property)
    let accessToken = oauthSession.accessToken ||
      sessionAny.data?.accessToken;

    console.log(
      `DELETE request - AccessToken found:`,
      !!accessToken,
    );
    console.log(
      `DELETE request - AccessToken length:`,
      accessToken?.length,
    );
    console.log(
      `DELETE request - AccessToken prefix:`,
      accessToken?.substring(0, 20) + "...",
    );

    // Try different ways to access the DPoP keys
    console.log(
      `DELETE request - Direct access to dpopPrivateKeyJWK:`,
      !!sessionAny.dpopPrivateKeyJWK,
    );
    console.log(`DELETE request - All session keys:`, Object.keys(sessionAny));
    console.log(
      `DELETE request - Session own properties:`,
      Object.getOwnPropertyNames(sessionAny),
    );

    // Access DPoP keys through the data property
    const oauthSessionData = sessionAny.data;
    console.log(`DELETE request - Session data exists:`, !!oauthSessionData);
    console.log(
      `DELETE request - Session data keys:`,
      oauthSessionData ? Object.keys(oauthSessionData) : "none",
    );

    let dpopPrivateKey = oauthSessionData?.dpopPrivateKeyJWK;
    let dpopPublicKey = oauthSessionData?.dpopPublicKeyJWK;

    console.log(`DELETE request - DPoP private key found:`, !!dpopPrivateKey);
    console.log(`DELETE request - DPoP public key found:`, !!dpopPublicKey);

    const hasDpopKeys = !!(dpopPrivateKey && dpopPublicKey);
    console.log(`DELETE request - Token uses DPoP:`, hasDpopKeys);

    // Create headers for the request
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    };

    // If this is a DPoP token, we need to create a DPoP proof header
    if (hasDpopKeys) {
      try {
        console.log("DELETE request - Creating DPoP proof header...");

        // Import necessary modules for DPoP
        const { SignJWT } = await import("https://esm.sh/jose@5.4.0");

        // Use the keys we found through iteration
        if (!dpopPrivateKey || !dpopPublicKey) {
          throw new Error("DPoP keys not found despite hasDpopKeys being true");
        }

        // Calculate JWK thumbprint for DPoP proof
        const { calculateJwkThumbprint } = await import(
          "https://esm.sh/jose@5.4.0"
        );
        let jkt = await calculateJwkThumbprint(dpopPublicKey, "sha256");

        console.log("DELETE request - Calculated JWK thumbprint:", jkt);

        // Check if JWK thumbprint matches the token's expected value
        // Decode the access token to get the expected jkt
        let expectedJkt = null;
        try {
          const tokenParts = accessToken.split(".");
          const payload = JSON.parse(atob(tokenParts[1]));
          expectedJkt = payload.cnf?.jkt;
        } catch (e) {
          console.log(
            "DELETE request - Could not decode token to check jkt:",
            e.message,
          );
        }

        console.log(
          "DELETE request - Expected JWK thumbprint from token:",
          expectedJkt,
        );

        // If thumbprints don't match, we need to refresh the token first
        if (expectedJkt && jkt !== expectedJkt) {
          console.log(
            "DELETE request - JWK thumbprint mismatch, forcing token refresh...",
          );

          // Force a token refresh by getting a fresh session
          oauthSession = await sessions.getOAuthSession(did);
          if (!oauthSession) {
            return new Response(
              JSON.stringify({ error: "Failed to refresh OAuth session" }),
              { status: 401, headers: corsHeaders },
            );
          }

          // Update session data with refreshed session
          const refreshedSessionAny = oauthSession as any;
          const refreshedSessionData = refreshedSessionAny.data;
          accessToken = refreshedSessionData?.accessToken;
          dpopPrivateKey = refreshedSessionData?.dpopPrivateKeyJWK;
          dpopPublicKey = refreshedSessionData?.dpopPublicKeyJWK;

          // Recalculate JWK thumbprint with refreshed keys
          const refreshedJkt = await calculateJwkThumbprint(
            dpopPublicKey,
            "sha256",
          );
          console.log(
            "DELETE request - Refreshed JWK thumbprint:",
            refreshedJkt,
          );

          // Update jkt for the DPoP proof
          jkt = refreshedJkt;
        }

        // Calculate access token hash for DPoP proof
        const encoder = new TextEncoder();
        const accessTokenBytes = encoder.encode(accessToken);
        const hashBuffer = await crypto.subtle.digest(
          "SHA-256",
          accessTokenBytes,
        );
        const hashArray = new Uint8Array(hashBuffer);
        const ath = btoa(String.fromCharCode(...hashArray))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "");

        console.log("DELETE request - Access token hash (ath):", ath);

        // Extract aud from access token to match its format (needed for DPoP proof)
        let tokenAud = pdsUrl;
        try {
          const tokenParts = accessToken.split(".");
          const payload = JSON.parse(atob(tokenParts[1]));
          if (payload.aud) {
            tokenAud = payload.aud;
            console.log("DELETE request - Using token aud for DPoP:", tokenAud);
          }
        } catch (_e) {
          console.log(
            "DELETE request - Could not extract aud from token, using PDS URL",
          );
        }

        // Try getting DPoP nonce by making a failed authenticated request first
        console.log(
          "DELETE request - Getting DPoP nonce with failed request strategy...",
        );
        let dpopNonce = null;
        try {
          // Make a DPoP request without nonce to get a nonce in the error response
          const tempNow = Math.floor(Date.now() / 1000);
          const tempDpopProof = await new SignJWT({
            htm: "POST",
            htu: `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
            jkt: jkt,
            ath: ath,
            iat: tempNow,
            jti: crypto.randomUUID(),
            aud: tokenAud,
          })
            .setProtectedHeader({
              alg: "ES256",
              typ: "dpop+jwt",
              jwk: dpopPublicKey,
            })
            .sign(
              await crypto.subtle.importKey(
                "jwk",
                dpopPrivateKey,
                { name: "ECDSA", namedCurve: "P-256" },
                false,
                ["sign"],
              ),
            );

          const nonceResponse = await fetch(
            `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
                "DPoP": tempDpopProof,
              },
              body: JSON.stringify({
                repo: did,
                collection: "app.dropanchor.checkin",
                rkey: rkey,
              }),
            },
          );

          // Check for DPoP-Nonce in response headers - this should be the standard two-step process
          dpopNonce = nonceResponse.headers.get("DPoP-Nonce");

          // Also check response body for specific DPoP nonce error
          if (!dpopNonce && !nonceResponse.ok) {
            try {
              const errorBody = await nonceResponse.json();
              console.log("DELETE request - Error response body:", errorBody);
              if (errorBody.error === "use_dpop_nonce") {
                // This is the expected first response - server requires nonce
                console.log(
                  "DELETE request - Server requires nonce (use_dpop_nonce error)",
                );
                dpopNonce = nonceResponse.headers.get("DPoP-Nonce");
              }
            } catch (_e) {
              // Ignore JSON parsing errors
              console.log("DELETE request - Could not parse error response");
            }
          }

          console.log(
            "DELETE request - Received DPoP nonce from failed request:",
            dpopNonce || "none",
          );
          if (dpopNonce) {
            console.log(
              "DELETE request - Successfully obtained nonce via two-step process",
            );
          }
        } catch (e) {
          console.log(
            "DELETE request - Failed to get nonce with failed request:",
            e.message,
          );
        }

        // Create DPoP proof using the tokenAud extracted earlier
        const now = Math.floor(Date.now() / 1000);
        const dpopPayload: any = {
          htm: "POST",
          htu: `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
          jkt: jkt,
          ath: ath,
          iat: now,
          jti: crypto.randomUUID(),
          aud: tokenAud,
        };

        // Add nonce if we received one, or try empty string as fallback
        if (dpopNonce) {
          dpopPayload.nonce = dpopNonce;
          console.log(
            "DELETE request - Including nonce in DPoP proof:",
            dpopNonce,
          );
        } else {
          // Try including empty nonce since server returned InvalidToken instead of use_dpop_nonce
          dpopPayload.nonce = "";
          console.log(
            "DELETE request - No server nonce, trying empty nonce fallback",
          );
        }

        const dpopProof = await new SignJWT(dpopPayload)
          .setProtectedHeader({
            alg: "ES256",
            typ: "dpop+jwt",
            jwk: dpopPublicKey,
          })
          .sign(
            await crypto.subtle.importKey(
              "jwk",
              dpopPrivateKey,
              { name: "ECDSA", namedCurve: "P-256" },
              false,
              ["sign"],
            ),
          );

        headers["DPoP"] = dpopProof;
        console.log("DELETE request - DPoP proof created successfully");
        console.log(
          "DELETE request - DPoP proof headers:",
          JSON.stringify(headers),
        );
      } catch (dpopError) {
        console.error(
          "DELETE request - DPoP proof creation failed:",
          dpopError,
        );
        // Continue without DPoP and see what happens
      }
    }

    // Delete the checkin record via AT Protocol
    const deleteUrl = `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`;
    const deleteBody = {
      repo: did,
      collection: "app.dropanchor.checkin",
      rkey: rkey,
    };

    console.log("DELETE request - Request URL:", deleteUrl);
    console.log("DELETE request - Request body:", JSON.stringify(deleteBody));

    let deleteResponse = await fetch(deleteUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(deleteBody),
    });

    console.log(
      `DELETE request - Delete response status: ${deleteResponse.status}`,
    );
    console.log(`DELETE request - Delete response ok: ${deleteResponse.ok}`);

    // If we get a 401 or 400 token error, try to refresh the token and retry
    if (
      !deleteResponse.ok &&
      (deleteResponse.status === 401 || deleteResponse.status === 400)
    ) {
      console.log(
        "DELETE request - Token might be expired, attempting to refresh...",
      );

      try {
        // Try to refresh the token by getting a fresh session
        oauthSession = await sessions.getOAuthSession(did);

        if (oauthSession) {
          console.log("DELETE request - Got fresh session, retrying delete...");

          // Extract the refreshed access token and DPoP keys
          const refreshSessionAny = oauthSession as any;
          const refreshedAccessToken = oauthSession.accessToken ||
            refreshSessionAny.data?.accessToken;

          // Create headers for retry request
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${refreshedAccessToken}`,
          };

          // If this is a DPoP token, create a new DPoP proof for the retry
          const retryDpopPrivateKey = refreshSessionAny.data?.dpopPrivateKeyJWK;
          const retryDpopPublicKey = refreshSessionAny.data?.dpopPublicKeyJWK;
          const hasRefreshDpopKeys =
            !!(retryDpopPrivateKey && retryDpopPublicKey);

          if (hasRefreshDpopKeys) {
            try {
              console.log("DELETE request - Creating DPoP proof for retry...");

              const { SignJWT, calculateJwkThumbprint } = await import(
                "https://esm.sh/jose@5.4.0"
              );

              // Calculate JWK thumbprint for retry DPoP proof
              const retryJkt = await calculateJwkThumbprint(
                retryDpopPublicKey,
                "sha256",
              );

              // Calculate access token hash for retry DPoP proof
              const retryEncoder = new TextEncoder();
              const retryAccessTokenBytes = retryEncoder.encode(
                refreshedAccessToken,
              );
              const retryHashBuffer = await crypto.subtle.digest(
                "SHA-256",
                retryAccessTokenBytes,
              );
              const retryHashArray = new Uint8Array(retryHashBuffer);
              const retryAth = btoa(String.fromCharCode(...retryHashArray))
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=/g, "");

              // Get fresh DPoP nonce for retry
              console.log(
                "DELETE request - Getting fresh DPoP nonce for retry with HEAD request...",
              );
              let retryDpopNonce = null;
              try {
                // Try HEAD request to base XRPC endpoint for retry
                const retryNonceResponse = await fetch(`${pdsUrl}/xrpc/`, {
                  method: "HEAD",
                });
                retryDpopNonce = retryNonceResponse.headers.get("DPoP-Nonce");

                if (!retryDpopNonce) {
                  // Try token endpoint for retry nonce
                  const retryTokenNonceResponse = await fetch(
                    `${pdsUrl}/oauth/token`,
                    {
                      method: "HEAD",
                    },
                  );
                  retryDpopNonce = retryTokenNonceResponse.headers.get(
                    "DPoP-Nonce",
                  );
                }

                console.log(
                  "DELETE request - Received retry DPoP nonce:",
                  retryDpopNonce || "none",
                );
              } catch (e) {
                console.log(
                  "DELETE request - Failed to get retry nonce:",
                  e.message,
                );
              }

              const retryNow = Math.floor(Date.now() / 1000);

              // Extract aud from refreshed access token for retry
              let retryTokenAud = pdsUrl;
              try {
                const retryTokenParts = refreshedAccessToken.split(".");
                const retryPayload = JSON.parse(atob(retryTokenParts[1]));
                if (retryPayload.aud) {
                  retryTokenAud = retryPayload.aud;
                  console.log(
                    "DELETE request - Using retry token aud for DPoP:",
                    retryTokenAud,
                  );
                }
              } catch (_e) {
                console.log(
                  "DELETE request - Could not extract aud from retry token, using PDS URL",
                );
              }

              const retryDpopPayload: any = {
                htm: "POST",
                htu: `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
                jkt: retryJkt,
                ath: retryAth,
                iat: retryNow,
                jti: crypto.randomUUID(),
                aud: retryTokenAud,
              };

              // Add nonce if we received one for retry
              if (retryDpopNonce) {
                retryDpopPayload.nonce = retryDpopNonce;
              }

              const dpopProof = await new SignJWT(retryDpopPayload)
                .setProtectedHeader({
                  alg: "ES256",
                  typ: "dpop+jwt",
                  jwk: retryDpopPublicKey,
                })
                .sign(
                  await crypto.subtle.importKey(
                    "jwk",
                    retryDpopPrivateKey,
                    { name: "ECDSA", namedCurve: "P-256" },
                    false,
                    ["sign"],
                  ),
                );

              retryHeaders["DPoP"] = dpopProof;
              console.log(
                "DELETE request - DPoP proof for retry created successfully",
              );
            } catch (dpopError) {
              console.error(
                "DELETE request - DPoP proof creation for retry failed:",
                dpopError,
              );
            }
          }

          // Retry the delete with the potentially refreshed token
          deleteResponse = await fetch(
            `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
            {
              method: "POST",
              headers: retryHeaders,
              body: JSON.stringify({
                repo: did,
                collection: "app.dropanchor.checkin",
                rkey: rkey,
              }),
            },
          );
        }
      } catch (refreshError) {
        console.error("DELETE request - Token refresh failed:", refreshError);
      }
    }

    if (!deleteResponse.ok) {
      console.error("Failed to delete checkin:", await deleteResponse.text());
      return new Response(
        JSON.stringify({ error: "Failed to delete checkin" }),
        {
          status: deleteResponse.status,
          headers: corsHeaders,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Checkin deleted successfully",
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Delete checkin error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// Handler for creating a like
async function handleCreateLike(
  checkinIdentifier: string, // Can be either a DID or a handle
  checkinRkey: string,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check authentication
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success) {
      console.error(
        "Like auth failed:",
        authResult.error,
        "Cookie:",
        req.headers.get("Cookie"),
      );
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authorDid = authResult.did;
    const oauthSession = authResult.oauthSession;

    if (!oauthSession) {
      return new Response(
        JSON.stringify({ error: "OAuth session not found" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    // Resolve identifier to DID (handles both DIDs and handles)
    let checkinDid = checkinIdentifier;
    if (!checkinIdentifier.startsWith("did:")) {
      // It's a handle, resolve it to a DID
      const resolvedDid = await resolveHandleToDid(checkinIdentifier);
      if (!resolvedDid) {
        return new Response(
          JSON.stringify({
            error: `Failed to resolve handle: ${checkinIdentifier}`,
          }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      checkinDid = resolvedDid;
    }

    // Create the like using OAuth session (handles token refresh and DPoP automatically)
    const result = await createLike(
      checkinDid,
      checkinRkey,
      authorDid,
      oauthSession,
    );

    return new Response(
      JSON.stringify({
        success: true,
        like: {
          uri: result.uri,
          createdAt: new Date().toISOString(),
        },
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Create like error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Handler for removing a like
async function handleRemoveLike(
  checkinIdentifier: string, // Can be either a DID or a handle
  checkinRkey: string,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check authentication
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authorDid = authResult.did;
    const oauthSession = authResult.oauthSession;

    if (!oauthSession) {
      return new Response(
        JSON.stringify({ error: "OAuth session not found" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    // Resolve identifier to DID (handles both DIDs and handles)
    let checkinDid = checkinIdentifier;
    if (!checkinIdentifier.startsWith("did:")) {
      // It's a handle, resolve it to a DID
      const resolvedDid = await resolveHandleToDid(checkinIdentifier);
      if (!resolvedDid) {
        return new Response(
          JSON.stringify({
            error: `Failed to resolve handle: ${checkinIdentifier}`,
          }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      checkinDid = resolvedDid;
    }

    // Remove the like using OAuth session (handles token refresh and DPoP automatically)
    await removeLike(
      checkinDid,
      checkinRkey,
      authorDid,
      oauthSession,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Like removed successfully",
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Remove like error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Handler for creating a comment
async function handleCreateComment(
  checkinIdentifier: string, // Can be either a DID or a handle
  checkinRkey: string,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check authentication
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authorDid = authResult.did;
    const oauthSession = authResult.oauthSession;

    if (!oauthSession) {
      return new Response(
        JSON.stringify({ error: "OAuth session not found" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    // Resolve identifier to DID (handles both DIDs and handles)
    let checkinDid = checkinIdentifier;
    if (!checkinIdentifier.startsWith("did:")) {
      // It's a handle, resolve it to a DID
      const resolvedDid = await resolveHandleToDid(checkinIdentifier);
      if (!resolvedDid) {
        return new Response(
          JSON.stringify({
            error: `Failed to resolve handle: ${checkinIdentifier}`,
          }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      checkinDid = resolvedDid;
    }

    // Parse request body
    const body = await req.json();
    const commentText = body.text;

    if (
      !commentText || typeof commentText !== "string" ||
      commentText.trim().length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Comment text is required" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Create the comment using OAuth session (handles token refresh and DPoP automatically)
    const result = await createComment(
      checkinDid,
      checkinRkey,
      authorDid,
      commentText,
      oauthSession,
    );

    return new Response(
      JSON.stringify({
        success: true,
        comment: {
          uri: result.uri,
          text: commentText,
          createdAt: new Date().toISOString(),
        },
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Create comment error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Handler for removing a comment
async function handleRemoveComment(
  checkinIdentifier: string, // Can be either a DID or a handle
  checkinRkey: string,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check authentication
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authorDid = authResult.did;
    const oauthSession = authResult.oauthSession;

    if (!oauthSession) {
      return new Response(
        JSON.stringify({ error: "OAuth session not found" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    // Resolve identifier to DID (handles both DIDs and handles)
    let checkinDid = checkinIdentifier;
    if (!checkinIdentifier.startsWith("did:")) {
      // It's a handle, resolve it to a DID
      const resolvedDid = await resolveHandleToDid(checkinIdentifier);
      if (!resolvedDid) {
        return new Response(
          JSON.stringify({
            error: `Failed to resolve handle: ${checkinIdentifier}`,
          }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      checkinDid = resolvedDid;
    }

    // Parse request body to get comment rkey
    const body = await req.json();
    const commentRkey = body.commentRkey;

    if (!commentRkey || typeof commentRkey !== "string") {
      return new Response(
        JSON.stringify({ error: "Comment rkey is required" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Remove the comment using OAuth session (handles token refresh and DPoP automatically)
    await removeComment(
      checkinDid,
      checkinRkey,
      commentRkey,
      authorDid,
      oauthSession,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Comment removed successfully",
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Remove comment error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// Helper function to get authenticated user DID and OAuth session
async function getAuthenticatedUserDid(req: Request): Promise<{
  success: boolean;
  did?: string;
  oauthSession?: any;
  error?: string;
}> {
  try {
    // Extract session cookie (OAuth package uses "sid" as cookie name)
    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader || !cookieHeader.includes("sid=")) {
      return { success: false, error: "Authentication required" };
    }

    const sessionCookie = cookieHeader
      .split(";")
      .find((c) => c.trim().startsWith("sid="))
      ?.split("=")[1];

    if (!sessionCookie) {
      console.error("No sid cookie found in:", cookieHeader);
      return { success: false, error: "Authentication required" };
    }

    // Unseal session data
    const { unsealData } = await import("npm:iron-session@8.0.4");
    const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
      "anchor-default-secret-for-development-only";

    const sessionData = await unsealData(decodeURIComponent(sessionCookie), {
      password: COOKIE_SECRET,
    });

    const userDid = (sessionData as any)?.did || (sessionData as any)?.userId ||
      (sessionData as any)?.sub;
    if (!userDid) {
      console.error("No DID in session data:", sessionData);
      return { success: false, error: "Authentication required" };
    }

    // Get OAuth session using sessions manager (provides makeRequest and other methods)
    const { sessions } = await import("../routes/oauth.ts");
    const oauthSession = await sessions.getOAuthSession(userDid);

    if (!oauthSession) {
      console.error("No OAuth session found for DID:", userDid);
      return { success: false, error: "OAuth session not found" };
    }

    return { success: true, did: userDid, oauthSession };
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

/**
 * Handler for POST /api/migrate-checkins
 * Migrates user's checkins to ensure coordinates are strings (DAG-CBOR compliance)
 */
async function handleMigrateCheckins(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check authentication
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const oauthSession = authResult.oauthSession;
    if (!oauthSession) {
      return new Response(
        JSON.stringify({ error: "OAuth session not found" }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    console.log(`🔧 Starting migration for ${authResult.did}`);

    // Run migration
    const result = await migrateUserCheckins(oauthSession);

    return new Response(
      JSON.stringify({
        success: true,
        migrated: result.migrated,
        failed: result.failed,
        errors: result.errors,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Migration endpoint error:", error);
    return new Response(
      JSON.stringify({
        error: "Migration failed",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
