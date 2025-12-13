/**
 * User checkins API endpoints
 * Handles fetching and displaying user checkins from their PDS
 * Supports multiple checkin lexicons (Anchor, BeaconBits, etc.)
 */

import {
  resolveHandleToDid,
  resolvePdsUrl,
  resolveProfileFromPds,
} from "../utils/atproto-resolver.ts";
import { db } from "../database/db.ts";
import { checkinCountsTable } from "../database/schema.ts";
import { and, eq } from "https://esm.sh/drizzle-orm@0.44.5";
import {
  CHECKIN_SOURCES,
  fetchAllRecords,
  type TransformedCheckin,
} from "../adapters/checkin-adapters.ts";

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
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${targetDid}&collection=app.dropanchor.checkin&limit=${limit}&reverse=true`;
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

    // Sort checkins by createdAt descending (newest first)
    const sortedRecords = [...(data.records || [])].sort(
      (a: any, b: any) => {
        const dateA = new Date(a.value?.createdAt || 0).getTime();
        const dateB = new Date(b.value?.createdAt || 0).getTime();
        return dateB - dateA;
      },
    );

    // Return fetched check-ins
    return new Response(
      JSON.stringify({
        checkins: sortedRecords,
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
 * Pagination options for checkin queries
 */
export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

/**
 * Get user checkins by DID with full formatting and metadata
 * Fetches from multiple lexicons (Anchor, BeaconBits, etc.) and merges results
 */
export async function getUserCheckinsByDid(
  did: string,
  corsHeaders: CorsHeaders,
  _pagination?: PaginationOptions,
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

    // Fetch from all configured checkin sources in parallel
    const fetchPromises = CHECKIN_SOURCES.map((source) =>
      fetchAllRecords(pdsUrl, did, source.collection).then((records) => ({
        source,
        records,
      }))
    );
    const results = await Promise.all(fetchPromises);

    // Transform all records using their source adapters
    const allTransformed: TransformedCheckin[] = [];
    for (const { source, records } of results) {
      for (const record of records) {
        const transformed = source.transform(record, did, pdsUrl);
        if (transformed) {
          allTransformed.push(transformed);
        }
      }
    }

    // Handle case where user has no checkins
    if (allTransformed.length === 0) {
      return new Response(
        JSON.stringify({ checkins: [], cursor: null }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    // Resolve profile data once for the user
    const profileData = await resolveProfileFromPds(did);

    // Enrich each transformed checkin with additional data
    const checkins = await Promise.all(
      allTransformed.map(async (transformed) => {
        const checkin: any = {
          id: transformed.id,
          uri: transformed.uri,
          author: {
            did: did,
            handle: profileData?.handle || did,
            displayName: profileData?.displayName,
            avatar: profileData?.avatar,
          },
          text: transformed.text,
          createdAt: transformed.createdAt,
          coordinates: transformed.coordinates,
          source: transformed.source,
        };

        // Add optional fields if present
        if (transformed.address) checkin.address = transformed.address;
        if (transformed.category) checkin.category = transformed.category;
        if (transformed.categoryGroup) {
          checkin.categoryGroup = transformed.categoryGroup;
        }
        if (transformed.categoryIcon) {
          checkin.categoryIcon = transformed.categoryIcon;
        }
        if (transformed.fsq) checkin.fsq = transformed.fsq;

        // Build image URLs from CIDs (Anchor only)
        if (transformed.imageThumbCid && transformed.imageFullsizeCid) {
          checkin.image = {
            thumbUrl:
              `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${transformed.imageThumbCid}`,
            fullsizeUrl:
              `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${transformed.imageFullsizeCid}`,
            alt: transformed.imageAlt,
          };
        }

        // Fetch like count from database (for Anchor checkins only)
        if (transformed.source === "anchor") {
          try {
            const countResult = await db.select()
              .from(checkinCountsTable)
              .where(and(
                eq(checkinCountsTable.checkinDid, did),
                eq(checkinCountsTable.checkinRkey, transformed.id),
              ))
              .limit(1);

            if (countResult.length > 0 && countResult[0].likesCount > 0) {
              checkin.likesCount = countResult[0].likesCount;
            }
          } catch (countError) {
            // Log but don't fail if count fetch fails
            console.warn("Failed to fetch like count for checkin:", countError);
          }
        }

        return checkin;
      }),
    );

    // Sort by createdAt descending (newest first)
    checkins.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return new Response(
      JSON.stringify({
        checkins,
        cursor: null, // No cursor needed - we fetch all and sort client-side
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
 * Searches across all configured checkin sources (Anchor, BeaconBits, etc.)
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

    // Try each configured checkin source until we find the record
    let record: any = null;
    let matchedSource: typeof CHECKIN_SOURCES[0] | null = null;

    for (const source of CHECKIN_SOURCES) {
      const response = await fetch(
        `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=${source.collection}&rkey=${rkey}`,
      );

      if (response.ok) {
        record = await response.json();
        matchedSource = source;
        break;
      }
    }

    if (!record || !matchedSource) {
      return new Response(
        JSON.stringify({ error: "Checkin not found" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Transform the record using its source adapter
    const transformed = matchedSource.transform(record, did, pdsUrl);
    if (!transformed) {
      return new Response(
        JSON.stringify({ error: "Checkin has invalid data" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Resolve profile data
    const profileData = await resolveProfileFromPds(did);

    const checkin: any = {
      id: transformed.id,
      uri: transformed.uri,
      author: {
        did: did,
        handle: profileData?.handle || did,
        displayName: profileData?.displayName,
        avatar: profileData?.avatar,
      },
      text: transformed.text,
      createdAt: transformed.createdAt,
      coordinates: transformed.coordinates,
      source: transformed.source,
    };

    // Add optional fields from transformed data
    if (transformed.address) checkin.address = transformed.address;
    if (transformed.category) checkin.category = transformed.category;
    if (transformed.categoryGroup) {
      checkin.categoryGroup = transformed.categoryGroup;
    }
    if (transformed.categoryIcon) {
      checkin.categoryIcon = transformed.categoryIcon;
    }
    if (transformed.fsq) checkin.fsq = transformed.fsq;

    // Build image URLs from CIDs (Anchor only)
    if (transformed.imageThumbCid && transformed.imageFullsizeCid) {
      checkin.image = {
        thumbUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${transformed.imageThumbCid}`,
        fullsizeUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${transformed.imageFullsizeCid}`,
        alt: transformed.imageAlt,
      };
    }

    // Handle old Anchor format with addressRef (not handled by adapter)
    if (
      !checkin.address && record.value?.addressRef &&
      transformed.source === "anchor"
    ) {
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

    // Fetch like count from database (for Anchor checkins only)
    if (transformed.source === "anchor") {
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
