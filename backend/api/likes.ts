// Likes API endpoints for checkin interactions
// Handles like creation, retrieval, and deletion for check-ins

import { resolvePdsUrl, resolveProfileFromPds } from "./anchor-api.ts";
import { db } from "../database/db.ts";
import {
  CheckinCountInsert,
  checkinCountsTable,
  CheckinInteractionInsert,
  checkinInteractionsTable,
} from "../database/schema.ts";
import { and, desc, eq, sql } from "https://esm.sh/drizzle-orm@0.44.5";

// Interface for like records
interface LikeRecord {
  uri: string;
  cid: string;
  value: {
    $type: string;
    createdAt: string;
    checkinRef: {
      uri: string;
      cid: string;
    };
  };
}

// Interface for API response format
interface LikeResponse {
  uri: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  createdAt: string;
}

// Create a like for a checkin
export async function createLike(
  checkinDid: string,
  checkinRkey: string,
  authorDid: string,
  oauthSession: any, // OAuthSession from @tijs/atproto-oauth-hono
): Promise<{ uri: string; cid: string }> {
  try {
    const likerPdsUrl = oauthSession.pdsUrl;

    // Resolve the checkin owner's PDS URL (might be different from liker's PDS)
    const checkinOwnerPdsUrl = await resolvePdsUrl(checkinDid);
    if (!checkinOwnerPdsUrl) {
      throw new Error(`Failed to resolve PDS for checkin owner: ${checkinDid}`);
    }

    // First, get the checkin record to create a proper reference
    // Fetch from the checkin owner's PDS, not the liker's PDS
    const checkinResponse = await fetch(
      `${checkinOwnerPdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${checkinDid}&collection=app.dropanchor.checkin&rkey=${checkinRkey}`,
    );

    if (!checkinResponse.ok) {
      throw new Error(`Checkin not found: ${checkinResponse.status}`);
    }

    const checkinData = await checkinResponse.json();

    // Create the like record
    const likeRecord = {
      $type: "app.dropanchor.like",
      createdAt: new Date().toISOString(),
      checkinRef: {
        uri: `at://${checkinDid}/app.dropanchor.checkin/${checkinRkey}`,
        cid: checkinData.cid,
      },
    };

    // Create the like record in the liker's PDS using OAuth session's makeRequest
    // This automatically handles token refresh and DPoP
    const createResponse = await oauthSession.makeRequest(
      "POST",
      `${likerPdsUrl}/xrpc/com.atproto.repo.createRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: authorDid, // Store in the liker's PDS
          collection: "app.dropanchor.like",
          record: likeRecord,
        }),
      },
    );

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(
        `Failed to create like: ${createResponse.status} - ${
          errorData.message || "Unknown error"
        }`,
      );
    }

    const result = await createResponse.json();

    // Store interaction in index for efficient discovery
    try {
      const checkinAtUri =
        `at://${checkinDid}/app.dropanchor.checkin/${checkinRkey}`;

      // Insert or replace interaction record
      const interactionData: CheckinInteractionInsert = {
        checkinDid,
        checkinRkey,
        checkinUri: checkinAtUri,
        authorDid,
        interactionType: "like",
        interactionUri: result.uri,
        interactionRkey: result.uri.split("/").pop() || "",
        interactionCid: result.cid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.insert(checkinInteractionsTable)
        .values(interactionData)
        .onConflictDoUpdate({
          target: [
            checkinInteractionsTable.checkinDid,
            checkinInteractionsTable.checkinRkey,
            checkinInteractionsTable.authorDid,
            checkinInteractionsTable.interactionType,
          ],
          set: {
            interactionUri: result.uri,
            interactionCid: result.cid,
            updatedAt: new Date().toISOString(),
          },
        });

      // Update or insert count record
      const existingCount = await db.select()
        .from(checkinCountsTable)
        .where(and(
          eq(checkinCountsTable.checkinDid, checkinDid),
          eq(checkinCountsTable.checkinRkey, checkinRkey),
        ))
        .limit(1);

      if (existingCount.length > 0) {
        // Update existing count
        await db.update(checkinCountsTable)
          .set({
            likesCount: sql`${checkinCountsTable.likesCount} + 1`,
            lastLikeAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(and(
            eq(checkinCountsTable.checkinDid, checkinDid),
            eq(checkinCountsTable.checkinRkey, checkinRkey),
          ));
      } else {
        // Insert new count record
        const countData: CheckinCountInsert = {
          checkinDid,
          checkinRkey,
          checkinUri: checkinAtUri,
          likesCount: 1,
          commentsCount: 0,
          lastLikeAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await db.insert(checkinCountsTable).values(countData);
      }
    } catch (indexError) {
      // Log index error but don't fail the like creation
      console.warn("Failed to update like index:", indexError);
    }

    return result;
  } catch (error) {
    console.error("Create like error:", error);
    throw error;
  }
}

// Get all likes for a checkin using efficient index-based discovery
export async function getLikesForCheckin(
  checkinDid: string,
  checkinRkey: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Use index to efficiently find all likes for this checkin
    const indexLikes = await db.select()
      .from(checkinInteractionsTable)
      .where(and(
        eq(checkinInteractionsTable.checkinDid, checkinDid),
        eq(checkinInteractionsTable.checkinRkey, checkinRkey),
        eq(checkinInteractionsTable.interactionType, "like"),
      ))
      .orderBy(desc(checkinInteractionsTable.createdAt));

    if (indexLikes.length === 0) {
      // No likes found in index, return empty result
      return new Response(
        JSON.stringify({
          likes: [],
          count: 0,
        }),
        {
          headers: corsHeaders,
        },
      );
    }

    const allLikes: LikeResponse[] = [];

    // Fetch actual like records from PDS instances using index data
    for (const indexLike of indexLikes) {
      try {
        // Get the liker's PDS URL
        const likerPdsUrl = await resolvePdsUrl(indexLike.authorDid);
        if (!likerPdsUrl) continue;

        // Fetch the actual like record from the liker's PDS
        const recordResponse = await fetch(
          `${likerPdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${indexLike.authorDid}&collection=app.dropanchor.like&rkey=${indexLike.interactionRkey}`,
        );

        if (!recordResponse.ok) {
          console.warn(
            `Failed to fetch like record ${indexLike.interactionUri}: ${recordResponse.status}`,
          );
          continue;
        }

        const recordData = await recordResponse.json();

        // Get fresh profile data for the liker
        const profileData = await resolveProfileFromPds(indexLike.authorDid);

        const likeResponse: LikeResponse = {
          uri: recordData.uri,
          author: {
            did: indexLike.authorDid,
            handle: profileData?.handle || indexLike.authorDid,
            displayName: profileData?.displayName,
            avatar: profileData?.avatar,
          },
          createdAt: recordData.value.createdAt,
        };

        allLikes.push(likeResponse);
      } catch (error) {
        console.warn(
          `Failed to fetch like ${indexLike.interactionUri}:`,
          error,
        );
        // Continue to next like
      }
    }

    // Get total count from index (more efficient than counting array)
    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(checkinInteractionsTable)
      .where(and(
        eq(checkinInteractionsTable.checkinDid, checkinDid),
        eq(checkinInteractionsTable.checkinRkey, checkinRkey),
        eq(checkinInteractionsTable.interactionType, "like"),
      ));

    return new Response(
      JSON.stringify({
        likes: allLikes,
        count: countResult[0]?.count || allLikes.length,
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Get likes error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// Remove a like from a checkin
export async function removeLike(
  checkinDid: string,
  checkinRkey: string,
  authorDid: string, // The person who created the like (the liker)
  oauthSession: any, // OAuthSession from @tijs/atproto-oauth-hono
): Promise<void> {
  try {
    const pdsUrl = oauthSession.pdsUrl;

    // First, find the like record that this user created for this checkin
    const checkinAtUri =
      `at://${checkinDid}/app.dropanchor.checkin/${checkinRkey}`;

    const listResponse = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${authorDid}&collection=app.dropanchor.like&limit=100`,
    );

    if (!listResponse.ok) {
      throw new Error(`Failed to fetch user likes: ${listResponse.status}`);
    }

    const listData = await listResponse.json();

    // Find the like record that references this specific checkin
    const likeRecord = listData.records.find((record: LikeRecord) => {
      return record.value.checkinRef?.uri === checkinAtUri;
    });

    if (!likeRecord) {
      throw new Error("Like not found");
    }

    // Extract rkey from the like record URI
    const likeRkey = likeRecord.uri.split("/").pop();

    // Delete the like record from the liker's PDS using OAuth session's makeRequest
    // This automatically handles token refresh and DPoP
    const deleteResponse = await oauthSession.makeRequest(
      "POST",
      `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: authorDid, // Delete from the liker's PDS
          collection: "app.dropanchor.like",
          rkey: likeRkey,
        }),
      },
    );

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json();
      throw new Error(
        `Failed to delete like: ${deleteResponse.status} - ${
          errorData.message || "Unknown error"
        }`,
      );
    }

    // Remove interaction from index
    try {
      await db.delete(checkinInteractionsTable)
        .where(and(
          eq(checkinInteractionsTable.checkinDid, checkinDid),
          eq(checkinInteractionsTable.checkinRkey, checkinRkey),
          eq(checkinInteractionsTable.authorDid, authorDid),
          eq(checkinInteractionsTable.interactionType, "like"),
        ));

      // Update count record
      const existingCount = await db.select()
        .from(checkinCountsTable)
        .where(and(
          eq(checkinCountsTable.checkinDid, checkinDid),
          eq(checkinCountsTable.checkinRkey, checkinRkey),
        ))
        .limit(1);

      if (existingCount.length > 0) {
        await db.update(checkinCountsTable)
          .set({
            likesCount: sql`MAX(0, ${checkinCountsTable.likesCount} - 1)`,
            updatedAt: new Date().toISOString(),
          })
          .where(and(
            eq(checkinCountsTable.checkinDid, checkinDid),
            eq(checkinCountsTable.checkinRkey, checkinRkey),
          ));
      }
    } catch (indexError) {
      // Log index error but don't fail the like deletion
      console.warn("Failed to update like index on removal:", indexError);
    }
  } catch (error) {
    console.error("Remove like error:", error);
    throw error;
  }
}
