/**
 * Authentication helper utilities
 * Handles OAuth session extraction and validation
 */

import { sessions } from "../routes/oauth.ts";

export interface AuthResult {
  success: boolean;
  did?: string;
  oauthSession?: any;
  error?: string;
}

/**
 * Extract and validate authenticated user from request
 * Returns DID and OAuth session if authentication is successful
 */
export async function getAuthenticatedUserDid(
  req: Request,
): Promise<AuthResult> {
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
