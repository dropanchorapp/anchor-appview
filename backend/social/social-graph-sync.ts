// @val-town socialGraphSync
// Cron job: Runs nightly to sync social graph data from AT Protocol
// Populates user_follows table for following feed functionality

import { db, initializeTables } from "../database/db.ts";
import { makeDPoPRequestWithKeys } from "../oauth/dpop.ts";
import { importJWK } from "https://esm.sh/jose@5.2.0";

interface FollowRecord {
  uri: string;
  cid: string;
  value: {
    subject: string;
    $type: "app.bsky.graph.follow";
    createdAt: string;
  };
}

interface SocialGraphSyncResult {
  success: boolean;
  usersProcessed: number;
  followsAdded: number;
  followsRemoved: number;
  errors: string[];
  timestamp: string;
}

interface SessionDataWithCryptoKeys {
  did: string;
  handle: string;
  accessToken: string;
  refreshToken: string;
  dpopPrivateKey: CryptoKey;
  dpopPublicKey: CryptoKey;
  dpopPublicKeyJWK: any; // Raw JWK data for public key
  pdsUrl: string;
}

export default async function (): Promise<Response> {
  console.log("Starting social graph sync...");

  const result: SocialGraphSyncResult = {
    success: false,
    usersProcessed: 0,
    followsAdded: 0,
    followsRemoved: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  try {
    await initializeTables();

    // Get all users who have OAuth sessions (authenticated users)
    const sessions = await db.execute(`
      SELECT DISTINCT did, handle, access_token, dpop_private_key, dpop_public_key, pds_url
      FROM oauth_sessions 
      WHERE access_token IS NOT NULL
    `);

    if (!sessions.rows || sessions.rows.length === 0) {
      console.log("No authenticated users found for social graph sync");
      result.success = true;
      return createResponse(result);
    }

    console.log(`Found ${sessions.rows.length} authenticated users`);

    // Process each user's social graph
    for (const session of sessions.rows) {
      try {
        // Validate PDS URL before processing
        const pdsUrl = session.pds_url as string;
        if (
          !pdsUrl || pdsUrl.includes("/null") || !pdsUrl.startsWith("https://")
        ) {
          console.log(
            `Skipping user ${session.handle} due to invalid PDS URL: ${pdsUrl}`,
          );
          result.errors.push(`User ${session.handle}: Invalid PDS URL`);
          continue;
        }

        // Parse JWK strings and import as CryptoKey objects
        const privateKeyJWK = JSON.parse(session.dpop_private_key as string);
        const publicKeyJWK = JSON.parse(session.dpop_public_key as string);

        const dpopPrivateKey = await importJWK(
          privateKeyJWK,
          "ES256",
          { extractable: true },
        );
        const dpopPublicKey = await importJWK(
          publicKeyJWK,
          "ES256",
          { extractable: true },
        );

        const sessionData: SessionDataWithCryptoKeys = {
          did: session.did as string,
          handle: session.handle as string,
          accessToken: session.access_token as string,
          refreshToken: "", // Not needed for this operation
          dpopPrivateKey,
          dpopPublicKey,
          dpopPublicKeyJWK: publicKeyJWK, // Pass raw JWK data
          pdsUrl: pdsUrl,
        };

        const userResult = await syncUserFollows(sessionData);
        result.usersProcessed += 1;
        result.followsAdded += userResult.followsAdded;
        result.followsRemoved += userResult.followsRemoved;

        if (userResult.error) {
          result.errors.push(`User ${session.handle}: ${userResult.error}`);
        }

        // Rate limiting - wait between users
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMsg =
          `Failed to sync user ${session.handle}: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    result.success = result.errors.length < sessions.rows.length; // Success if at least some users synced

    console.log(
      `Social graph sync completed: ${result.usersProcessed} users processed, ${result.followsAdded} follows added, ${result.followsRemoved} follows removed`,
    );

    return createResponse(result);
  } catch (error) {
    console.error("Social graph sync failed:", error);
    result.errors.push(error.message);
    return createResponse(result, 500);
  }
}

async function syncUserFollows(
  session: SessionDataWithCryptoKeys,
): Promise<{ followsAdded: number; followsRemoved: number; error?: string }> {
  try {
    // Fetch user's follows from their PDS using authenticated request
    const followsUrl =
      `${session.pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${session.did}&collection=app.bsky.graph.follow&limit=100`;

    const response = await makeDPoPRequestWithKeys(
      "GET",
      followsUrl,
      session,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch follows: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const followRecords: FollowRecord[] = data.records || [];

    // Extract DIDs of users being followed
    const currentFollows = followRecords.map((record) => record.value.subject);

    // Get existing follows from database
    const existingResult = await db.execute(
      `SELECT following_did FROM user_follows WHERE follower_did = ?`,
      [session.did],
    );

    const existingFollows = new Set(
      existingResult.rows?.map((row) => row.following_did as string) || [],
    );

    const newFollows = new Set(currentFollows);

    // Calculate changes
    const toAdd = currentFollows.filter((did) => !existingFollows.has(did));
    const toRemove = Array.from(existingFollows).filter((did) =>
      !newFollows.has(did)
    );

    // Remove unfollows
    if (toRemove.length > 0) {
      const placeholders = toRemove.map(() => "?").join(",");
      await db.execute(
        `DELETE FROM user_follows WHERE follower_did = ? AND following_did IN (${placeholders})`,
        [session.did, ...toRemove],
      );
    }

    // Add new follows
    for (const followingDid of toAdd) {
      await db.execute(
        `INSERT OR IGNORE INTO user_follows (follower_did, following_did, created_at, synced_at) VALUES (?, ?, ?, ?)`,
        [
          session.did,
          followingDid,
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    }

    console.log(
      `Synced follows for ${session.handle}: +${toAdd.length} -${toRemove.length}`,
    );

    return {
      followsAdded: toAdd.length,
      followsRemoved: toRemove.length,
    };
  } catch (error) {
    console.error(`Error syncing follows for ${session.handle}:`, error);
    return {
      followsAdded: 0,
      followsRemoved: 0,
      error: error.message,
    };
  }
}

function createResponse(
  result: SocialGraphSyncResult,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(result, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
