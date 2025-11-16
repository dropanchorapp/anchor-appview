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
 *
 * This now uses the package's built-in getOAuthSessionFromRequest() method
 * which handles cookie extraction, unsealing, and session retrieval automatically.
 */
export async function getAuthenticatedUserDid(
  req: Request,
): Promise<AuthResult> {
  try {
    // Use package method to extract and validate session
    const oauthSession = await sessions.getOAuthSessionFromRequest(req);

    if (!oauthSession) {
      return { success: false, error: "Authentication required" };
    }

    return { success: true, did: oauthSession.did, oauthSession };
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}
