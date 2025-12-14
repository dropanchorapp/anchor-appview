// Comments API endpoints for checkin interactions
// Handles comment creation, retrieval, and deletion for check-ins

import {
  resolvePdsUrl,
  resolveProfileFromPds,
} from "../utils/atproto-resolver.ts";
import { db } from "../database/db.ts";
import {
  CheckinCountInsert,
  checkinCountsTable,
  CheckinInteractionInsert,
  checkinInteractionsTable,
} from "../database/schema.ts";
import { and, desc, eq, sql } from "https://esm.sh/drizzle-orm@0.44.5";
import {
  getAuthenticatedUserDid,
  getClearSessionCookie,
} from "../utils/auth-helpers.ts";
import { setSessionCookie } from "../utils/session.ts";
import { resolveHandleToDid } from "../utils/atproto-resolver.ts";

export interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

// Interface for comment records
interface CommentRecord {
  uri: string;
  cid: string;
  value: {
    $type: string;
    text: string;
    createdAt: string;
    checkinRef: {
      uri: string;
      cid: string;
    };
  };
}

// Interface for API response format
interface CommentResponse {
  uri: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text: string;
  createdAt: string;
}

// Create a comment for a checkin
export async function createComment(
  checkinDid: string,
  checkinRkey: string,
  authorDid: string,
  commentText: string,
  oauthSession: any, // OAuthSession from @tijs/atproto-oauth
): Promise<{ uri: string; cid: string }> {
  try {
    // Validate comment text
    if (!commentText || commentText.trim().length === 0) {
      throw new Error("Comment text is required");
    }

    if (commentText.length > 1000) {
      throw new Error("Comment text must be 1000 characters or less");
    }

    const pdsUrl = oauthSession.pdsUrl;

    // First, get the checkin record to create a proper reference
    const checkinResponse = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${checkinDid}&collection=app.dropanchor.checkin&rkey=${checkinRkey}`,
    );

    if (!checkinResponse.ok) {
      throw new Error(`Checkin not found: ${checkinResponse.status}`);
    }

    const checkinData = await checkinResponse.json();

    // Create the comment record
    const commentRecord = {
      $type: "app.dropanchor.comment",
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
      checkinRef: {
        uri: `at://${checkinDid}/app.dropanchor.checkin/${checkinRkey}`,
        cid: checkinData.cid,
      },
    };

    // Create the comment record in the commenter's PDS using OAuth session's makeRequest
    // This automatically handles token refresh and DPoP
    const createResponse = await oauthSession.makeRequest(
      "POST",
      `${pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: authorDid, // Store in the commenter's PDS
          collection: "app.dropanchor.comment",
          record: commentRecord,
        }),
      },
    );

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(
        `Failed to create comment: ${createResponse.status} - ${
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
        interactionType: "comment",
        interactionUri: result.uri,
        interactionRkey: result.uri.split("/").pop() || "",
        interactionCid: result.cid,
        commentText: commentText.trim(),
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
            commentText: commentText.trim(),
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
            commentsCount: sql`${checkinCountsTable.commentsCount} + 1`,
            lastCommentAt: new Date().toISOString(),
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
          likesCount: 0,
          commentsCount: 1,
          lastCommentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await db.insert(checkinCountsTable).values(countData);
      }
    } catch (indexError) {
      // Log index error but don't fail the comment creation
      console.warn("Failed to update comment index:", indexError);
    }

    return result;
  } catch (error) {
    console.error("Create comment error:", error);
    throw error;
  }
}

// Get all comments for a checkin using efficient index-based discovery
export async function getCommentsForCheckin(
  checkinDid: string,
  checkinRkey: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Use index to efficiently find all comments for this checkin
    const indexComments = await db.select()
      .from(checkinInteractionsTable)
      .where(and(
        eq(checkinInteractionsTable.checkinDid, checkinDid),
        eq(checkinInteractionsTable.checkinRkey, checkinRkey),
        eq(checkinInteractionsTable.interactionType, "comment"),
      ))
      .orderBy(desc(checkinInteractionsTable.createdAt));

    if (indexComments.length === 0) {
      // No comments found in index, return empty result
      return new Response(
        JSON.stringify({
          comments: [],
          count: 0,
        }),
        {
          headers: corsHeaders,
        },
      );
    }

    const allComments: CommentResponse[] = [];

    // Fetch actual comment records from PDS instances using index data
    for (const indexComment of indexComments) {
      try {
        // Get the commenter's PDS URL
        const commenterPdsUrl = await resolvePdsUrl(indexComment.authorDid);
        if (!commenterPdsUrl) continue;

        // Fetch the actual comment record from the commenter's PDS
        const recordResponse = await fetch(
          `${commenterPdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${indexComment.authorDid}&collection=app.dropanchor.comment&rkey=${indexComment.interactionRkey}`,
        );

        if (!recordResponse.ok) {
          console.warn(
            `Failed to fetch comment record ${indexComment.interactionUri}: ${recordResponse.status}`,
          );
          continue;
        }

        const recordData = await recordResponse.json();

        // Get fresh profile data for the commenter
        const profileData = await resolveProfileFromPds(indexComment.authorDid);

        const commentResponse: CommentResponse = {
          uri: recordData.uri,
          author: {
            did: indexComment.authorDid,
            handle: profileData?.handle || indexComment.authorDid,
            displayName: profileData?.displayName,
            avatar: profileData?.avatar,
          },
          text: recordData.value.text,
          createdAt: recordData.value.createdAt,
        };

        allComments.push(commentResponse);
      } catch (error) {
        console.warn(
          `Failed to fetch comment ${indexComment.interactionUri}:`,
          error,
        );
        // Continue to next comment
      }
    }

    // Get total count from index (more efficient than counting array)
    const countResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(checkinInteractionsTable)
      .where(and(
        eq(checkinInteractionsTable.checkinDid, checkinDid),
        eq(checkinInteractionsTable.checkinRkey, checkinRkey),
        eq(checkinInteractionsTable.interactionType, "comment"),
      ));

    return new Response(
      JSON.stringify({
        comments: allComments,
        count: countResult[0]?.count || allComments.length,
      }),
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Get comments error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// Remove a comment from a checkin
export async function removeComment(
  checkinDid: string,
  checkinRkey: string,
  commentRkey: string,
  authorDid: string, // The person who created the comment (the commenter)
  oauthSession: any, // OAuthSession from @tijs/atproto-oauth
): Promise<void> {
  try {
    const pdsUrl = oauthSession.pdsUrl;

    // Verify that the comment exists and belongs to the authenticated user
    const commentResponse = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${authorDid}&collection=app.dropanchor.comment&rkey=${commentRkey}`,
    );

    if (!commentResponse.ok) {
      throw new Error("Comment not found");
    }

    const commentData = await commentResponse.json();

    // Verify that this comment references the specified checkin
    const checkinAtUri =
      `at://${checkinDid}/app.dropanchor.checkin/${checkinRkey}`;
    if (commentData.value.checkinRef?.uri !== checkinAtUri) {
      throw new Error("Comment does not reference the specified checkin");
    }

    // Delete the comment record from the commenter's PDS using OAuth session's makeRequest
    // This automatically handles token refresh and DPoP
    const deleteResponse = await oauthSession.makeRequest(
      "POST",
      `${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: authorDid, // Delete from the commenter's PDS
          collection: "app.dropanchor.comment",
          rkey: commentRkey,
        }),
      },
    );

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json();
      throw new Error(
        `Failed to delete comment: ${deleteResponse.status} - ${
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
          eq(checkinInteractionsTable.interactionType, "comment"),
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
            commentsCount: sql`MAX(0, ${checkinCountsTable.commentsCount} - 1)`,
            updatedAt: new Date().toISOString(),
          })
          .where(and(
            eq(checkinCountsTable.checkinDid, checkinDid),
            eq(checkinCountsTable.checkinRkey, checkinRkey),
          ));
      }
    } catch (indexError) {
      // Log index error but don't fail the comment deletion
      console.warn("Failed to update comment index on removal:", indexError);
    }
  } catch (error) {
    console.error("Remove comment error:", error);
    throw error;
  }
}

// HTTP Handler wrappers for REST API

/**
 * HTTP handler for POST /api/checkins/:identifier/:rkey/comments
 */
export async function createCommentHandler(
  req: Request,
  identifier: string,
  rkey: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    // Get authentication with session refresh support
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success || !authResult.oauthSession) {
      const response = new Response(
        JSON.stringify({
          error: authResult.error || "Authentication required",
          code: authResult.errorCode || "SESSION_EXPIRED",
        }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
      response.headers.set("Set-Cookie", getClearSessionCookie());
      return response;
    }

    // Resolve identifier to DID
    let checkinDid = identifier;
    if (!identifier.startsWith("did:")) {
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
      checkinDid = resolvedDid;
    }

    // Parse request body
    const body = await req.json();
    const commentText = body.text;

    if (!commentText) {
      return new Response(
        JSON.stringify({ error: "Comment text is required" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Create comment
    const result = await createComment(
      checkinDid,
      rkey,
      authResult.did,
      commentText,
      authResult.oauthSession,
    );

    return setSessionCookie(
      new Response(
        JSON.stringify(result),
        {
          status: 201,
          headers: corsHeaders,
        },
      ),
      authResult.setCookieHeader,
    );
  } catch (error) {
    console.error("Create comment HTTP handler error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Failed to create comment",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

/**
 * HTTP handler for DELETE /api/checkins/:identifier/:rkey/comments
 */
export async function removeCommentHandler(
  req: Request,
  identifier: string,
  rkey: string,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    // Get authentication with session refresh support
    const authResult = await getAuthenticatedUserDid(req);
    if (!authResult.success || !authResult.oauthSession) {
      const response = new Response(
        JSON.stringify({
          error: authResult.error || "Authentication required",
          code: authResult.errorCode || "SESSION_EXPIRED",
        }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
      response.headers.set("Set-Cookie", getClearSessionCookie());
      return response;
    }

    // Resolve identifier to DID
    let checkinDid = identifier;
    if (!identifier.startsWith("did:")) {
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
      checkinDid = resolvedDid;
    }

    // Parse request body to get comment rkey
    const body = await req.json();
    const commentRkey = body.rkey;

    if (!commentRkey) {
      return new Response(
        JSON.stringify({ error: "Comment rkey is required" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Remove comment
    await removeComment(
      checkinDid,
      rkey,
      commentRkey,
      authResult.did,
      authResult.oauthSession,
    );

    return setSessionCookie(
      new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: corsHeaders,
        },
      ),
      authResult.setCookieHeader,
    );
  } catch (error) {
    console.error("Remove comment HTTP handler error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Failed to remove comment",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
