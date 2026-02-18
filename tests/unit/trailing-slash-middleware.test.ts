// Unit tests for trailing slash normalization middleware
// Verifies that requests with trailing slashes are redirected (308)
// to the canonical URL without trailing slash, preserving HTTP method.
//
// This prevents Fresh's static route lookup from missing registered routes
// (e.g. POST /api/checkins/ missing the "/api/checkins" static route key).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * Extracted middleware logic from main.ts for testability.
 * Returns a redirect Response for trailing-slash URLs, or null to pass through.
 */
function normalizeTrailingSlash(requestUrl: string): Response | null {
  const url = new URL(requestUrl);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return Response.redirect(url.toString(), 308);
  }
  return null;
}

Deno.test("Trailing slash middleware - redirects /api/checkins/ to /api/checkins", () => {
  const result = normalizeTrailingSlash("https://dropanchor.app/api/checkins/");
  assertEquals(result?.status, 308);
  assertEquals(
    result?.headers.get("Location"),
    "https://dropanchor.app/api/checkins",
  );
});

Deno.test("Trailing slash middleware - does not redirect /api/checkins (no slash)", () => {
  const result = normalizeTrailingSlash(
    "https://dropanchor.app/api/checkins",
  );
  assertEquals(result, null);
});

Deno.test("Trailing slash middleware - does not redirect root path /", () => {
  const result = normalizeTrailingSlash("https://dropanchor.app/");
  assertEquals(result, null);
});

Deno.test("Trailing slash middleware - redirects nested API paths", () => {
  const result = normalizeTrailingSlash(
    "https://dropanchor.app/api/checkins/did:plc:abc/",
  );
  assertEquals(result?.status, 308);
  assertEquals(
    result?.headers.get("Location"),
    "https://dropanchor.app/api/checkins/did:plc:abc",
  );
});

Deno.test("Trailing slash middleware - preserves query parameters", () => {
  const result = normalizeTrailingSlash(
    "https://dropanchor.app/api/places/nearby/?lat=40.7&lng=-74.0",
  );
  assertEquals(result?.status, 308);
  assertEquals(
    result?.headers.get("Location"),
    "https://dropanchor.app/api/places/nearby?lat=40.7&lng=-74.0",
  );
});

Deno.test("Trailing slash middleware - uses 308 status (preserves method+body)", () => {
  const result = normalizeTrailingSlash(
    "https://dropanchor.app/api/checkins/",
  );
  // 308 Permanent Redirect preserves the HTTP method (unlike 301/302 which change to GET)
  assertEquals(result?.status, 308);
});

Deno.test("Trailing slash middleware - does not redirect frontend routes without slash", () => {
  const result = normalizeTrailingSlash("https://dropanchor.app/terms");
  assertEquals(result, null);
});

Deno.test("Trailing slash middleware - redirects frontend routes with trailing slash", () => {
  const result = normalizeTrailingSlash("https://dropanchor.app/terms/");
  assertEquals(result?.status, 308);
  assertEquals(
    result?.headers.get("Location"),
    "https://dropanchor.app/terms",
  );
});
