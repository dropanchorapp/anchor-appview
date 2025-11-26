/**
 * Authentication helper utilities
 * Handles OAuth session extraction and validation with cookie refresh support
 */

import { getClearSessionCookie, getSessionFromRequest } from "./session.ts";

export interface AuthResult {
  success: boolean;
  did?: string;
  oauthSession?: any;
  /** Set-Cookie header to refresh the session - should be set on response */
  setCookieHeader?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Extract and validate authenticated user from request
 * Returns DID, OAuth session, and Set-Cookie header for session refresh
 *
 * This now uses the session utility which properly refreshes iron-session cookies.
 * The returned setCookieHeader should be set on successful responses to extend session TTL.
 */
export async function getAuthenticatedUserDid(
  req: Request,
): Promise<AuthResult> {
  const { session: oauthSession, setCookieHeader, error } =
    await getSessionFromRequest(req);

  if (!oauthSession) {
    return {
      success: false,
      error: error?.message || "Authentication required",
      errorCode: error?.type || "SESSION_EXPIRED",
    };
  }

  return {
    success: true,
    did: oauthSession.did,
    oauthSession,
    setCookieHeader,
  };
}

// Re-export for convenience
export { getClearSessionCookie };
