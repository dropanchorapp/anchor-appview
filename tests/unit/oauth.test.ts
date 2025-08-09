// OAuth functionality tests
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handleClientMetadata } from "../../backend/oauth/endpoints.ts";
import { generatePKCE } from "../../backend/oauth/dpop.ts";
import { OAUTH_CONFIG } from "../../backend/oauth/config.ts";

Deno.test("OAuth - client metadata endpoint", () => {
  const response = handleClientMetadata();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Content-Type"), "application/json");
  assertEquals(response.headers.get("Cache-Control"), "public, max-age=3600");
});

Deno.test("OAuth - client metadata content", async () => {
  const response = handleClientMetadata();
  const metadata = await response.json();

  assertEquals(metadata.client_id, OAUTH_CONFIG.CLIENT_ID);
  assertEquals(metadata.client_name, "Anchor Location Feed");
  assertEquals(metadata.application_type, "web");
  assertEquals(metadata.dpop_bound_access_tokens, true);
  assertExists(metadata.redirect_uris);
  assertEquals(metadata.redirect_uris.length, 1);
  assertEquals(metadata.redirect_uris[0], OAUTH_CONFIG.REDIRECT_URI);
});

Deno.test("OAuth - PKCE generation", async () => {
  const pkce = await generatePKCE();

  assertExists(pkce.codeVerifier);
  assertExists(pkce.codeChallenge);
  assertEquals(pkce.codeChallengeMethod, "S256");

  // Code verifier should be at least 43 characters
  assertEquals(pkce.codeVerifier.length >= 43, true);

  // Code challenge should be base64url encoded
  assertEquals(pkce.codeChallenge.includes("+"), false);
  assertEquals(pkce.codeChallenge.includes("/"), false);
  assertEquals(pkce.codeChallenge.includes("="), false);
});

Deno.test("OAuth - PKCE uniqueness", async () => {
  const pkce1 = await generatePKCE();
  const pkce2 = await generatePKCE();

  // Each generation should produce unique values
  assertEquals(pkce1.codeVerifier === pkce2.codeVerifier, false);
  assertEquals(pkce1.codeChallenge === pkce2.codeChallenge, false);
});
