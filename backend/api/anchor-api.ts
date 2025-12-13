// @val-town anchorAPI
// Main HTTP API handler for Anchor AppView
import { initializeTables } from "../database/db.ts";
import {
  createLikeHandler,
  getLikesForCheckin,
  removeLikeHandler,
} from "./likes.ts";
import {
  createCommentHandler,
  getCommentsForCheckin,
  removeCommentHandler,
} from "./comments.ts";
import { getNearbyPlaces, getPlaceCategories, searchPlaces } from "./places.ts";
import { getStats, getUserDataExport } from "./stats.ts";
import {
  getCheckinByDidAndRkey,
  getUserCheckins,
  getUserCheckinsByDid,
  type PaginationOptions,
} from "./user-checkins.ts";
import { resolveHandleToDid } from "../utils/atproto-resolver.ts";
import { getAuthenticatedUserDid } from "../utils/auth-helpers.ts";
import { migrateUserCheckins } from "../services/checkin-migration-service.ts";

// Types
interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

/**
 * Handler for POST /api/migrate-checkins
 * Migrates user's checkins to ensure coordinates are strings (DAG-CBOR compliance)
 */
async function handleMigrateCheckins(
  req: Request,
  corsHeaders: CorsHeaders,
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
        migrated: result.formatMigrated + result.coordinateMigrated,
        formatMigrated: result.formatMigrated,
        coordinateMigrated: result.coordinateMigrated,
        addressesDeleted: result.addressesDeleted,
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

/**
 * Main router - delegates to modular handlers
 */
export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const corsHeaders: CorsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cookie, Authorization",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize database tables
  await initializeTables();

  // Route to appropriate handler
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
      // Handle /api/checkins/:identifier/:rkey pattern
      const checkinMatch = url.pathname.match(
        /^\/api\/checkins\/([^\/]+)\/([^\/]+)$/,
      );
      if (checkinMatch) {
        const [, identifier, rkey] = checkinMatch;

        if (req.method === "GET") {
          return await getCheckinByDidAndRkey(identifier, rkey, corsHeaders);
        }

        // POST and DELETE are handled directly by main.tsx routes
      }

      // Handle /api/checkins/:identifier pattern
      const checkinsMatch = url.pathname.match(
        /^\/api\/checkins\/([^\/]+)$/,
      );
      if (checkinsMatch) {
        const [, identifier] = checkinsMatch;

        if (req.method === "GET") {
          // Resolve identifier to DID if needed
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

          // Extract pagination params from query string
          const pagination: PaginationOptions = {};
          const limitParam = url.searchParams.get("limit");
          const cursorParam = url.searchParams.get("cursor");
          if (limitParam) {
            const limit = parseInt(limitParam, 10);
            if (!isNaN(limit) && limit > 0 && limit <= 100) {
              pagination.limit = limit;
            }
          }
          if (cursorParam) {
            pagination.cursor = cursorParam;
          }

          return await getUserCheckinsByDid(did, corsHeaders, pagination);
        }

        // POST is handled directly by main.tsx routes
      }

      // Handle likes endpoints: /api/checkins/:identifier/:rkey/likes
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
          return await createLikeHandler(req, identifier, rkey, corsHeaders);
        }

        if (req.method === "DELETE") {
          return await removeLikeHandler(req, identifier, rkey, corsHeaders);
        }
      }

      // Handle comments endpoints: /api/checkins/:identifier/:rkey/comments
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
          return await createCommentHandler(req, identifier, rkey, corsHeaders);
        }

        if (req.method === "DELETE") {
          return await removeCommentHandler(req, identifier, rkey, corsHeaders);
        }
      }

      // No match found
      return new Response(
        JSON.stringify({ error: "Not found" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }
  }

  // Fallback for unhandled routes
  return new Response(
    JSON.stringify({ error: "Not found" }),
    {
      status: 404,
      headers: corsHeaders,
    },
  );
}
