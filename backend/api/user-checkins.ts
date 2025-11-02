/**
 * User checkins API endpoints
 * Handles fetching and displaying user checkins from their PDS
 */

import {
  resolveHandleToDid,
  resolvePdsUrl,
  resolveProfileFromPds,
} from "../utils/atproto-resolver.ts";
import { migrateUserCheckins } from "../services/checkin-migration-service.ts";
import { sessions } from "../routes/oauth.ts";
import { db } from "../database/db.ts";
import { checkinCountsTable } from "../database/schema.ts";
import { and, eq } from "https://esm.sh/drizzle-orm@0.44.5";

export interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

/**
 * GET /api/user - Get checkins for authenticated user or specified DID/handle
 */
export async function getUserCheckins(
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
        JSON.stringify({ error: "Failed to resolve PDS URL" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Fetch checkins directly from user's PDS (public data)
    const limit = url.searchParams.get("limit") || "50";
    const cursor = url.searchParams.get("cursor");

    let listUrl =
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${targetDid}&collection=app.dropanchor.checkin&limit=${limit}`;
    if (cursor) {
      listUrl += `&cursor=${cursor}`;
    }

    const response = await fetch(listUrl);

    if (!response.ok) {
      console.error("Failed to fetch check-ins from PDS:", response.status);
      return new Response(
        JSON.stringify({ error: "Failed to fetch check-ins" }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    const data = await response.json();

    // Return fetched check-ins
    return new Response(
      JSON.stringify({
        checkins: data.records,
        cursor: data.cursor,
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Get user checkins error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch check-ins" }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

/**
 * Get user checkins by DID with full formatting and metadata
 */
export async function getUserCheckinsByDid(
  did: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return new Response(
        JSON.stringify({ error: "Failed to resolve PDS URL" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Fetch all checkins for this user
    const response = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.dropanchor.checkin&limit=100`,
    );

    if (!response.ok) {
      console.error("Failed to fetch check-ins:", response.status);
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

        // Add category info if present
        if (record.value.category) {
          checkin.category = record.value.category;
        }
        if (record.value.categoryGroup) {
          checkin.categoryGroup = record.value.categoryGroup;
        }
        if (record.value.categoryIcon) {
          checkin.categoryIcon = record.value.categoryIcon;
        }

        // Fetch and include address record
        if (record.value.addressRef?.uri) {
          try {
            const addressUri = record.value.addressRef.uri;
            const addressRkey = addressUri.split("/").pop();
            const addressCollection = addressUri.split("/").slice(-2, -1)[0];

            const addressResponse = await fetch(
              `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=${addressCollection}&rkey=${addressRkey}`,
            );

            if (addressResponse.ok) {
              const addressData = await addressResponse.json();
              checkin.address = {
                name: addressData.value.name,
                street: addressData.value.street,
                locality: addressData.value.locality,
                region: addressData.value.region,
                country: addressData.value.country,
                postalCode: addressData.value.postalCode,
              };
            }
          } catch (error) {
            console.warn("Failed to fetch address for checkin:", error);
          }
        }

        // Add image URLs if present (construct URLs from blob CIDs)
        if (record.value.image?.thumb && record.value.image?.fullsize) {
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

        // Fetch like count from database
        try {
          const countResult = await db.select()
            .from(checkinCountsTable)
            .where(and(
              eq(checkinCountsTable.checkinDid, did),
              eq(checkinCountsTable.checkinRkey, rkey),
            ))
            .limit(1);

          if (countResult.length > 0 && countResult[0].likesCount > 0) {
            checkin.likesCount = countResult[0].likesCount;
          }
        } catch (countError) {
          // Log but don't fail if count fetch fails
          console.warn("Failed to fetch like count for checkin:", countError);
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

/**
 * GET /api/checkins/:identifier/:rkey - Get a specific checkin
 * identifier can be DID or handle
 */
export async function getCheckinByDidAndRkey(
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
        JSON.stringify({ error: "Failed to resolve PDS URL" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Fetch the specific checkin
    const response = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.dropanchor.checkin&rkey=${rkey}`,
    );

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Checkin not found" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    const data = await response.json();
    const record = data;

    // Parse coordinates
    const rawCoords = record.value.coordinates;
    const coordinates = {
      latitude: parseFloat(rawCoords.latitude),
      longitude: parseFloat(rawCoords.longitude),
    };

    // Resolve profile data
    const profileData = await resolveProfileFromPds(did);

    const checkin: any = {
      id: rkey,
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

    // Add category info if present
    if (record.value.category) {
      checkin.category = record.value.category;
    }
    if (record.value.categoryGroup) {
      checkin.categoryGroup = record.value.categoryGroup;
    }
    if (record.value.categoryIcon) {
      checkin.categoryIcon = record.value.categoryIcon;
    }

    // Fetch and include address record
    if (record.value.addressRef?.uri) {
      try {
        const addressUri = record.value.addressRef.uri;
        const addressRkey = addressUri.split("/").pop();
        const addressCollection = addressUri.split("/").slice(-2, -1)[0];

        const addressResponse = await fetch(
          `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=${addressCollection}&rkey=${addressRkey}`,
        );

        if (addressResponse.ok) {
          const addressData = await addressResponse.json();
          checkin.address = {
            name: addressData.value.name,
            street: addressData.value.street,
            locality: addressData.value.locality,
            region: addressData.value.region,
            country: addressData.value.country,
            postalCode: addressData.value.postalCode,
          };
        }
      } catch (error) {
        console.warn("Failed to fetch address for checkin:", error);
      }
    }

    // Add image URLs if present (construct URLs from blob CIDs)
    if (record.value.image?.thumb && record.value.image?.fullsize) {
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

    // Fetch like count from database
    try {
      const countResult = await db.select()
        .from(checkinCountsTable)
        .where(and(
          eq(checkinCountsTable.checkinDid, did),
          eq(checkinCountsTable.checkinRkey, rkey),
        ))
        .limit(1);

      if (countResult.length > 0 && countResult[0].likesCount > 0) {
        checkin.likesCount = countResult[0].likesCount;
      }
    } catch (countError) {
      // Log but don't fail if count fetch fails
      console.warn("Failed to fetch like count for checkin:", countError);
    }

    return new Response(
      JSON.stringify({ checkin }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Get checkin error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
