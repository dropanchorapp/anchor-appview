/**
 * User checkins API endpoints
 * Handles fetching and displaying user checkins from their PDS
 */

import {
  resolveHandleToDid,
  resolvePdsUrl,
  resolveProfileFromPds,
} from "../utils/atproto-resolver.ts";
import { db } from "../database/db.ts";
import { checkinCountsTable } from "../database/schema.ts";
import { and, eq } from "https://esm.sh/drizzle-orm@0.44.5";

/**
 * Fetch address record from PDS (for old format checkins with addressRef)
 */
async function fetchAddressRecordPublic(
  pdsUrl: string,
  did: string,
  addressRef: { uri: string; cid: string },
): Promise<
  {
    name?: string;
    street?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  } | null
> {
  try {
    // Extract rkey from AT URI: at://did:plc:xxx/community.lexicon.location.address/rkey
    const rkey = addressRef.uri.split("/").pop();
    if (!rkey) return null;

    const response = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=community.lexicon.location.address&rkey=${rkey}`,
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.value;
  } catch {
    return null;
  }
}

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

    // Use all records
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

        // Parse coordinates - handle both old and new format
        let coordinates;
        if (record.value?.geo) {
          // NEW format: embedded geo object
          const rawGeo = record.value.geo;
          coordinates = {
            latitude: typeof rawGeo.latitude === "number"
              ? rawGeo.latitude
              : parseFloat(rawGeo.latitude),
            longitude: typeof rawGeo.longitude === "number"
              ? rawGeo.longitude
              : parseFloat(rawGeo.longitude),
          };
        } else if (record.value?.coordinates) {
          // OLD format: coordinates object (will be migrated on login)
          const rawCoords = record.value.coordinates;
          coordinates = {
            latitude: typeof rawCoords.latitude === "number"
              ? rawCoords.latitude
              : parseFloat(rawCoords.latitude),
            longitude: typeof rawCoords.longitude === "number"
              ? rawCoords.longitude
              : parseFloat(rawCoords.longitude),
          };
        } else {
          console.warn(
            `⚠️ Skipping checkin ${rkey} with missing geo/coordinates`,
          );
          return null;
        }

        // Validate parsed coordinates
        if (isNaN(coordinates.latitude) || isNaN(coordinates.longitude)) {
          console.warn(`⚠️ Skipping checkin ${rkey} with invalid coordinates`);
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

        // Get address - handle both old and new format
        if (record.value.address && typeof record.value.address === "object") {
          // NEW format: embedded address object
          checkin.address = {
            name: record.value.address.name,
            street: record.value.address.street,
            locality: record.value.address.locality,
            region: record.value.address.region,
            country: record.value.address.country,
            postalCode: record.value.address.postalCode,
          };
        } else if (record.value.addressRef) {
          // OLD format: fetch referenced address record (will be migrated on login)
          const addressData = await fetchAddressRecordPublic(
            pdsUrl,
            did,
            record.value.addressRef,
          );
          if (addressData) {
            checkin.address = {
              name: addressData.name,
              street: addressData.street,
              locality: addressData.locality,
              region: addressData.region,
              country: addressData.country,
              postalCode: addressData.postalCode,
            };
          }
        }

        // Add fsq data if present
        if (record.value.fsq && typeof record.value.fsq === "object") {
          checkin.fsq = {
            fsqPlaceId: record.value.fsq.fsqPlaceId,
            name: record.value.fsq.name,
            latitude: record.value.fsq.latitude,
            longitude: record.value.fsq.longitude,
          };
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

    // Parse coordinates - handle both old and new format
    let coordinates;
    if (record.value?.geo) {
      // NEW format: embedded geo object
      const rawGeo = record.value.geo;
      coordinates = {
        latitude: typeof rawGeo.latitude === "number"
          ? rawGeo.latitude
          : parseFloat(rawGeo.latitude),
        longitude: typeof rawGeo.longitude === "number"
          ? rawGeo.longitude
          : parseFloat(rawGeo.longitude),
      };
    } else if (record.value?.coordinates) {
      // OLD format: coordinates object (will be migrated on login)
      const rawCoords = record.value.coordinates;
      coordinates = {
        latitude: typeof rawCoords.latitude === "number"
          ? rawCoords.latitude
          : parseFloat(rawCoords.latitude),
        longitude: typeof rawCoords.longitude === "number"
          ? rawCoords.longitude
          : parseFloat(rawCoords.longitude),
      };
    } else {
      return new Response(
        JSON.stringify({ error: "Checkin has invalid geo/coordinates" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

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

    // Get address - handle both old and new format
    if (record.value.address && typeof record.value.address === "object") {
      // NEW format: embedded address object
      checkin.address = {
        name: record.value.address.name,
        street: record.value.address.street,
        locality: record.value.address.locality,
        region: record.value.address.region,
        country: record.value.address.country,
        postalCode: record.value.address.postalCode,
      };
    } else if (record.value.addressRef) {
      // OLD format: fetch referenced address record (will be migrated on login)
      const addressData = await fetchAddressRecordPublic(
        pdsUrl,
        did,
        record.value.addressRef,
      );
      if (addressData) {
        checkin.address = {
          name: addressData.name,
          street: addressData.street,
          locality: addressData.locality,
          region: addressData.region,
          country: addressData.country,
          postalCode: addressData.postalCode,
        };
      }
    }

    // Add fsq data if present
    if (record.value.fsq && typeof record.value.fsq === "object") {
      checkin.fsq = {
        fsqPlaceId: record.value.fsq.fsqPlaceId,
        name: record.value.fsq.name,
        latitude: record.value.fsq.latitude,
        longitude: record.value.fsq.longitude,
      };
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
