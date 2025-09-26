/**
 * Debug script to check OAuth sessions in the database
 * This will help diagnose why the OAuth session lookup is failing
 */

import { db } from "../backend/database/db.ts";
import { ironSessionStorageTable } from "../backend/database/schema.ts";
import { eq, like } from "https://esm.sh/drizzle-orm@0.44.5";

// The DID that's failing
const FAILING_DID = "did:plc:aq7owa5y7ndc2hzjz37wy7ma";

export default async function debugOAuthSessions() {
  try {
    console.log("🔍 Debugging OAuth sessions...");

    // Check all OAuth sessions (now in iron_session_storage)
    console.log("\n📊 All OAuth sessions:");
    const allSessions = await db.select().from(ironSessionStorageTable)
      .where(like(ironSessionStorageTable.key, "session:%"));
    console.log(`Found ${allSessions.length} total sessions`);

    allSessions.forEach((session, i) => {
      try {
        const sessionData = JSON.parse(session.value);
        const did = session.key.replace("session:", "");
        console.log(`Session ${i + 1}:`, {
          did,
          handle: sessionData.handle,
          createdAt: session.createdAt,
          tokenExpiresAt: sessionData.expiresAt,
          isExpired: sessionData.expiresAt
            ? new Date() > new Date(sessionData.expiresAt)
            : false,
        });
      } catch {
        console.log(
          `Session ${i + 1}: Invalid session data for ${session.key}`,
        );
      }
    });

    // Check for the specific failing DID
    console.log(`\n🎯 Looking for session with DID: ${FAILING_DID}`);
    const targetSession = await db.select()
      .from(ironSessionStorageTable)
      .where(eq(ironSessionStorageTable.key, `session:${FAILING_DID}`))
      .limit(1);

    if (targetSession.length > 0) {
      try {
        const sessionData = JSON.parse(targetSession[0].value);
        const did = targetSession[0].key.replace("session:", "");
        console.log("✅ Found session for failing DID:", {
          did,
          handle: sessionData.handle,
          createdAt: targetSession[0].createdAt,
          tokenExpiresAt: sessionData.expiresAt,
          isExpired: sessionData.expiresAt
            ? new Date() > new Date(sessionData.expiresAt)
            : false,
        });
      } catch {
        console.log("❌ Invalid session data for failing DID");
      }
    } else {
      console.log("❌ No session found for failing DID");
    }

    // Test the OAuth sessions API directly
    console.log("\n🧪 Testing OAuth sessions API...");
    const { sessions } = await import("../backend/routes/oauth.ts");

    try {
      const oauthSession = await sessions.getOAuthSession(FAILING_DID);
      if (oauthSession) {
        console.log("✅ OAuth sessions API found session:", {
          did: oauthSession.did,
          handle: oauthSession.handle,
          pdsUrl: oauthSession.pdsUrl,
        });
      } else {
        console.log("❌ OAuth sessions API returned null for DID");
      }
    } catch (error) {
      console.error("❌ OAuth sessions API error:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalSessions: allSessions.length,
        targetDid: FAILING_DID,
        hasTargetSession: targetSession.length > 0,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Debug script error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
