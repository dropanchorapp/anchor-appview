/**
 * Session utilities with comprehensive error logging.
 * Wraps OAuth session methods to provide detailed diagnostics.
 */

import type {
  OAuthSessionFromRequestResult,
  SessionInterface,
} from "jsr:@tijs/atproto-oauth@2.4.0";
import { getOAuth } from "../routes/oauth.ts";

export interface SessionResult {
  session: SessionInterface | null;
  /** Set-Cookie header to refresh the session - should be set on response */
  setCookieHeader?: string;
  error?: {
    type: string;
    message: string;
    details?: unknown;
  };
}

// Rate limit error alerts to avoid log spam (max 1 per hour per error type)
const alertRateLimits = new Map<string, number>();
const ALERT_RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Send email alert for unexpected session errors.
 * Rate-limited to prevent spam.
 */
function sendSessionErrorAlert(
  errorType: string,
  errorMessage: string,
  context: Record<string, unknown>,
): void {
  const rateKey = `session_error:${errorType}`;
  const lastSent = alertRateLimits.get(rateKey) || 0;
  const now = Date.now();

  if (now - lastSent < ALERT_RATE_LIMIT_MS) {
    return;
  }

  alertRateLimits.set(rateKey, now);

  console.error(`[Session] Error alert: ${errorType}`, {
    time: new Date().toISOString(),
    type: errorType,
    message: errorMessage,
    context,
  });
}

/**
 * Get OAuth session from request with detailed error logging and cookie refresh.
 *
 * This method now properly refreshes the iron-session cookie on each request,
 * extending the session lifetime. The returned `setCookieHeader` should be set
 * on the response to keep the session alive.
 *
 * @param request - The HTTP request
 * @returns SessionResult with session, setCookieHeader, and optional error
 */
export async function getSessionFromRequest(
  request: Request,
): Promise<SessionResult> {
  try {
    // Use the new method that returns Set-Cookie header for session refresh
    const result: OAuthSessionFromRequestResult = await oauth
      .getSessionFromRequest(request);

    if (!result.session) {
      const errorType = result.error?.type || "NO_SESSION";
      const errorMessage = result.error?.message || "No active session found";

      console.warn("[Session] No session found in request", {
        url: request.url,
        hasCookie: request.headers.get("cookie")?.includes("sid="),
        errorType,
        errorMessage,
        timestamp: new Date().toISOString(),
      });

      // Alert on unexpected errors (not normal cases like missing cookie)
      if (
        result.error?.type === "OAUTH_ERROR" ||
        result.error?.type === "UNKNOWN"
      ) {
        sendSessionErrorAlert(errorType, errorMessage, {
          url: request.url,
          hasCookie: request.headers.get("cookie")?.includes("sid="),
          details: result.error?.details,
        });
      }

      return {
        session: null,
        error: {
          type: errorType,
          message: errorMessage,
          details: result.error?.details,
        },
      };
    }

    // Session found successfully
    console.debug("[Session] Valid session retrieved", {
      did: result.session.did,
      url: request.url,
      hasRefreshCookie: !!result.setCookieHeader,
      timestamp: new Date().toISOString(),
    });

    return {
      session: result.session,
      setCookieHeader: result.setCookieHeader,
    };
  } catch (error) {
    // Detailed error logging for different failure types
    const errorType = error instanceof Error
      ? error.constructor.name
      : "Unknown";
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("[Session] Failed to get session from request", {
      errorType,
      errorMessage,
      url: request.url,
      hasCookie: request.headers.get("cookie")?.includes("sid="),
      cookieValue:
        request.headers.get("cookie")?.match(/sid=([^;]+)/)?.[1]?.substring(
          0,
          20,
        ) + "...",
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Send alert for unexpected errors
    await sendSessionErrorAlert(errorType, errorMessage, {
      url: request.url,
      hasCookie: request.headers.get("cookie")?.includes("sid="),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Check for specific error patterns and map to user-friendly messages
    if (errorMessage.includes("Invalid handle")) {
      return {
        session: null,
        error: {
          type: "INVALID_HANDLE",
          message: "The handle in the session is invalid or cannot be resolved",
          details: { errorMessage },
        },
      };
    }

    if (errorMessage.includes("expired") || errorMessage.includes("Expired")) {
      return {
        session: null,
        error: {
          type: "SESSION_EXPIRED",
          message: "Your session has expired",
          details: { errorMessage },
        },
      };
    }

    if (errorMessage.includes("refresh") || errorMessage.includes("token")) {
      return {
        session: null,
        error: {
          type: "TOKEN_ERROR",
          message: "Session token error",
          details: { errorMessage },
        },
      };
    }

    // Generic error fallback
    return {
      session: null,
      error: {
        type: errorType,
        message: errorMessage,
        details: error,
      },
    };
  }
}

/**
 * Get clear cookie header for session cleanup.
 */
export function getClearSessionCookie(): string {
  return getOAuth().getClearCookieHeader();
}

/**
 * Helper to set session refresh cookie on response.
 *
 * Use this after making authenticated API calls to keep the session alive.
 * The setCookieHeader is returned from getSessionFromRequest() when valid.
 *
 * @param response - The response to add the Set-Cookie header to
 * @param setCookieHeader - The Set-Cookie header value (may be undefined)
 * @returns The response (for chaining)
 */
export function setSessionCookie(
  response: Response,
  setCookieHeader: string | undefined,
): Response {
  if (setCookieHeader) {
    response.headers.set("Set-Cookie", setCookieHeader);
  }
  return response;
}
