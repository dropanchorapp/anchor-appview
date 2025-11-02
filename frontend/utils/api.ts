/**
 * Centralized API client with automatic 401 handling
 * When a 401 response is received, the session is cleared and the user is redirected to login
 */

// Track if we're already redirecting to prevent loops
let isRedirecting = false;

/**
 * Enhanced fetch that handles 401 responses automatically
 * Clears local session state and reloads the page to trigger login flow
 *
 * Note: Do NOT use this for the initial /api/auth/session check on page load,
 * as that needs to handle 401 gracefully without redirecting. Use regular fetch() for that.
 */
export async function apiFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, options);

  // If we get a 401, the session has expired
  // But only redirect if this is NOT the initial session check AND we're not already redirecting
  if (
    response.status === 401 && !url.includes("/api/auth/session") &&
    !isRedirecting
  ) {
    isRedirecting = true;
    console.warn("Session expired, redirecting to login");

    // Clear any local session state
    try {
      // Trigger a page reload which will check session and show login
      globalThis.location.href = "/";
    } catch (error) {
      console.error("Failed to redirect after session expiry:", error);
      isRedirecting = false;
    }

    // Return the response anyway for consistency
    return response;
  }

  return response;
}

/**
 * Helper for GET requests
 */
export function apiGet(url: string): Promise<Response> {
  return apiFetch(url);
}

/**
 * Helper for POST requests
 */
export function apiPost(
  url: string,
  body?: any,
): Promise<Response> {
  return apiFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
}

/**
 * Helper for DELETE requests
 */
export function apiDelete(url: string): Promise<Response> {
  return apiFetch(url, {
    method: "DELETE",
    credentials: "include",
  });
}
