# ATProto OAuth Implementation Guide

Complete guide for implementing OAuth authentication with Bluesky/ATProto, based
on the book-explorer project's successful working implementation.

## Overview

ATProto (AT Protocol) uses OAuth 2.0 with advanced security features. This guide
provides a complete manual implementation that works with Deno/Val Town,
including:

- **OAuth Discovery** - Dynamic endpoint discovery via well-known URLs
- **S256 PKCE** - SHA256-based Proof Key for Code Exchange
- **DPoP** - Demonstration of Proof-of-Possession with ES256 JWTs
- **Nonce handling** - Anti-replay protection with automatic retry
- **Token refresh** - Automatic token refresh when expired
- **Session persistence** - SQLite storage for stateless operations

## Prerequisites

- Deno/TypeScript environment
- Web framework (Hono recommended)
- HTTPS domain for OAuth client metadata
- SQLite for session persistence

## Architecture Overview

Our implementation consists of:

1. **OAuth Client Metadata Endpoint** - Static JSON serving client info
2. **OAuth Start Endpoint** - Initiates OAuth flow with handle resolution
3. **OAuth Callback Handler** - Completes token exchange with DPoP
4. **Session Management** - SQLite storage with DPoP key persistence
5. **Authenticated API Helpers** - DPoP-authenticated requests with auto-refresh

## Step 1: Database Schema

```sql
-- OAuth session storage with DPoP key binding
CREATE TABLE oauth_sessions (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  pds_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  dpop_private_key TEXT NOT NULL,  -- JWK format
  dpop_public_key TEXT NOT NULL,   -- JWK format
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Step 2: OAuth Client Metadata

```typescript
// Serve client metadata for OAuth discovery
app.get("/client-metadata.json", (c) => {
  const metadata = {
    "client_id": APP_CONFIG.CLIENT_ID,
    "client_name": APP_CONFIG.APP_NAME,
    "client_uri": APP_CONFIG.BASE_URL,
    "logo_uri": `${APP_CONFIG.BASE_URL}/favicon.ico`,
    "redirect_uris": [APP_CONFIG.REDIRECT_URI],
    "scope": "atproto transition:generic",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "application_type": "web",
    "token_endpoint_auth_method": "none",
    "dpop_bound_access_tokens": true,
  };

  return c.json(metadata, 200, {
    "Content-Type": "application/json",
  });
});
```

## Step 3: DPoP Implementation

### DPoP Proof Generation

```typescript
async function generateDPoPProofWithKeys(
  method: string,
  url: string,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  accessToken?: string,
  nonce?: string,
) {
  // Export public key as JWK
  const jwk = await exportJWK(publicKey);

  // Create DPoP JWT payload
  const payload: any = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };

  // Add nonce if provided (for anti-replay)
  if (nonce) {
    payload.nonce = nonce;
  }

  // Add access token hash for authenticated requests
  if (accessToken) {
    const encoder = new TextEncoder();
    const data = encoder.encode(accessToken);
    const digest = await crypto.subtle.digest("SHA-256", data);
    payload.ath = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
      .replace(/=/g, "");
  }

  // Create and sign DPoP JWT
  const dpopProof = await new SignJWT(payload)
    .setProtectedHeader({
      typ: "dpop+jwt",
      alg: "ES256",
      jwk: jwk,
    })
    .sign(privateKey);

  return { dpopProof };
}
```

### DPoP Request Helper with Auto-Refresh

```typescript
async function makeDPoPRequest(
  method: string,
  url: string,
  session: OAuthSession,
  body?: string,
  retryWithRefresh = true,
): Promise<{ response: Response; session: OAuthSession }> {
  // Import the stored DPoP keys
  const privateKeyJWK = JSON.parse(session.dpopPrivateKey);
  const publicKeyJWK = JSON.parse(session.dpopPublicKey);
  const privateKey = await importJWK(privateKeyJWK, "ES256") as CryptoKey;
  const publicKey = await importJWK(publicKeyJWK, "ES256") as CryptoKey;

  // First attempt - without nonce
  const { dpopProof } = await generateDPoPProofWithKeys(
    method,
    url,
    privateKey,
    publicKey,
    session.accessToken,
  );

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `DPoP ${session.accessToken}`,
    "DPoP": dpopProof,
  };

  let response = await fetch(url, {
    method,
    headers,
    body,
  });

  // Handle 401 errors (nonce requirement or expired token)
  if (!response.ok && response.status === 401) {
    try {
      const errorData = await response.json();

      // Check if token is expired
      if (errorData.error === "invalid_token" && retryWithRefresh) {
        console.log("Token expired, attempting to refresh...");

        const refreshedSession = await refreshOAuthToken(session);
        if (refreshedSession) {
          console.log("Token refreshed successfully, retrying request...");
          // Retry with new token (but don't retry refresh again)
          return makeDPoPRequest(method, url, refreshedSession, body, false);
        } else {
          console.error("Failed to refresh token");
          return { response, session };
        }
      }

      // Handle nonce requirement
      if (errorData.error === "use_dpop_nonce") {
        const nonce = response.headers.get("DPoP-Nonce");
        if (nonce) {
          console.log(`Retrying ${method} ${url} with DPoP nonce:`, nonce);

          const { dpopProof: dpopProofWithNonce } =
            await generateDPoPProofWithKeys(
              method,
              url,
              privateKey,
              publicKey,
              session.accessToken,
              nonce,
            );

          const retriedHeaders = {
            ...headers,
            "DPoP": dpopProofWithNonce,
          };

          response = await fetch(url, {
            method,
            headers: retriedHeaders,
            body,
          });

          // Check if the nonce retry also failed due to expired token
          if (!response.ok && response.status === 401 && retryWithRefresh) {
            try {
              const retryErrorData = await response.json();
              if (retryErrorData.error === "invalid_token") {
                console.log(
                  "Token expired after nonce retry, attempting to refresh...",
                );

                const refreshedSession = await refreshOAuthToken(session);
                if (refreshedSession) {
                  console.log(
                    "Token refreshed successfully, retrying request with fresh token...",
                  );
                  return makeDPoPRequest(
                    method,
                    url,
                    refreshedSession,
                    body,
                    false,
                  );
                } else {
                  console.error("Failed to refresh token after nonce retry");
                }
              }
            } catch {
              // If parsing fails, continue to return response
            }
          }
        }
      }
    } catch {
      // If parsing fails, continue to return original response
    }
  }

  return { response, session };
}
```

## Step 4: OAuth Token Refresh

```typescript
async function refreshOAuthToken(
  session: OAuthSession,
): Promise<OAuthSession | null> {
  try {
    console.log(`Refreshing OAuth token for ${session.handle}`);

    // Get the user's token endpoint from their PDS
    const didDocResponse = await fetch(
      `${APP_CONFIG.PLC_DIRECTORY}/${session.did}`,
    );
    if (!didDocResponse.ok) {
      console.error("Failed to get DID document for token refresh");
      return null;
    }

    const didDoc = await didDocResponse.json();
    const pdsEndpoint = didDoc.service?.find((s: any) =>
      s.id === "#atproto_pds"
    )?.serviceEndpoint;

    if (!pdsEndpoint) {
      console.error("Could not find PDS endpoint for token refresh");
      return null;
    }

    // Discover OAuth metadata
    const resourceMetadataResponse = await fetch(
      `${pdsEndpoint}/.well-known/oauth-protected-resource`,
    );

    if (!resourceMetadataResponse.ok) {
      console.error("Failed to get OAuth metadata for token refresh");
      return null;
    }

    const resourceMetadata = await resourceMetadataResponse.json();
    const authServerUrl = resourceMetadata.authorization_servers?.[0];

    if (!authServerUrl) {
      console.error("No authorization server found for token refresh");
      return null;
    }

    // Get token endpoint
    const authServerMetadataResponse = await fetch(
      `${authServerUrl}/.well-known/oauth-authorization-server`,
    );

    if (!authServerMetadataResponse.ok) {
      console.error("Failed to get auth server metadata for token refresh");
      return null;
    }

    const authServerMetadata = await authServerMetadataResponse.json();
    const tokenEndpoint = authServerMetadata.token_endpoint;

    if (!tokenEndpoint) {
      console.error("No token endpoint found for refresh");
      return null;
    }

    // Import the stored DPoP keys
    const privateKeyJWK = JSON.parse(session.dpopPrivateKey);
    const publicKeyJWK = JSON.parse(session.dpopPublicKey);
    const privateKey = await importJWK(privateKeyJWK, "ES256") as CryptoKey;
    const publicKey = await importJWK(publicKeyJWK, "ES256") as CryptoKey;

    // Prepare refresh token request
    const requestBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      client_id: APP_CONFIG.CLIENT_ID,
    });

    // First attempt - without nonce
    const { dpopProof } = await generateDPoPProofWithKeys(
      "POST",
      tokenEndpoint,
      privateKey,
      publicKey,
    );

    let tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP": dpopProof,
      },
      body: requestBody,
    });

    // Handle nonce requirement for token refresh
    if (!tokenResponse.ok && tokenResponse.status === 400) {
      try {
        const errorData = await tokenResponse.json();
        if (errorData.error === "use_dpop_nonce") {
          const nonce = tokenResponse.headers.get("DPoP-Nonce");
          if (nonce) {
            console.log("Retrying token refresh with DPoP nonce");

            const { dpopProof: dpopProofWithNonce } =
              await generateDPoPProofWithKeys(
                "POST",
                tokenEndpoint,
                privateKey,
                publicKey,
                undefined,
                nonce,
              );

            tokenResponse = await fetch(tokenEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "DPoP": dpopProofWithNonce,
              },
              body: requestBody,
            });
          }
        }
      } catch {
        // Continue to general error handling
      }
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token refresh failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText,
      });
      return null;
    }

    const tokens = await tokenResponse.json();
    console.log("Successfully refreshed OAuth token");

    // Update session with new tokens
    const updatedSession: OAuthSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || session.refreshToken,
    };

    // Store updated session in database
    const now = Date.now();
    await sqlite.execute(
      `
      UPDATE oauth_sessions
      SET access_token = ?, refresh_token = ?, updated_at = ?
      WHERE did = ?
    `,
      [
        updatedSession.accessToken,
        updatedSession.refreshToken,
        now,
        session.did,
      ],
    );

    console.log(`Updated session in database for ${session.handle}`);

    return updatedSession;
  } catch (error) {
    console.error("Token refresh error:", error);
    return null;
  }
}
```

## Step 5: OAuth Flow Start

```typescript
app.post("/api/auth/start", async (c) => {
  const { handle } = await c.req.json();

  if (!handle) {
    return c.json({ error: "Handle is required" }, 400);
  }

  try {
    // Resolve handle to DID
    let did: string | null = null;
    const handleParts = handle.split(".");
    const potentialPDS = handleParts.length >= 2
      ? `https://${handleParts.slice(-2).join(".")}`
      : null;

    // Try multiple resolution services
    const resolutionServices = [
      potentialPDS,
      APP_CONFIG.ATPROTO_SERVICE,
      "https://api.bsky.app",
    ].filter(Boolean);

    for (const service of resolutionServices) {
      try {
        const resolveResponse = await fetch(
          `${service}/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
        );

        if (resolveResponse.ok) {
          const data = await resolveResponse.json();
          did = data.did;
          break;
        }
      } catch {
        // Try next service
      }
    }

    if (!did) {
      return c.json({ error: "Handle not found on any known service" }, 404);
    }

    // Get user's DID document to find PDS
    const didDocResponse = await fetch(`${APP_CONFIG.PLC_DIRECTORY}/${did}`);
    if (!didDocResponse.ok) {
      return c.json({ error: "Could not resolve DID" }, 404);
    }

    const didDoc = await didDocResponse.json();
    const pdsEndpoint = didDoc.service?.find((s: any) =>
      s.id === "#atproto_pds"
    )?.serviceEndpoint;

    if (!pdsEndpoint) {
      return c.json({ error: "Could not find PDS endpoint" }, 404);
    }

    // Discover OAuth protected resource metadata
    const resourceMetadataResponse = await fetch(
      `${pdsEndpoint}/.well-known/oauth-protected-resource`,
    );

    if (!resourceMetadataResponse.ok) {
      return c.json({ error: "PDS does not support OAuth" }, 400);
    }

    const resourceMetadata = await resourceMetadataResponse.json();
    const authServerUrl = resourceMetadata.authorization_servers?.[0];

    if (!authServerUrl) {
      return c.json({ error: "No authorization server found" }, 400);
    }

    // Discover OAuth authorization server metadata
    const authServerMetadataResponse = await fetch(
      `${authServerUrl}/.well-known/oauth-authorization-server`,
    );

    if (!authServerMetadataResponse.ok) {
      return c.json(
        { error: "Could not get authorization server metadata" },
        400,
      );
    }

    const authServerMetadata = await authServerMetadataResponse.json();
    const authorizationEndpoint = authServerMetadata.authorization_endpoint;
    const tokenEndpoint = authServerMetadata.token_endpoint;

    if (!authorizationEndpoint || !tokenEndpoint) {
      return c.json({ error: "Invalid authorization server metadata" }, 400);
    }

    // Generate OAuth parameters
    const { codeVerifier, codeChallenge, codeChallengeMethod } =
      await generatePKCE();

    // Encode state data for serverless compatibility
    const stateData = {
      codeVerifier,
      handle,
      did,
      pdsEndpoint,
      authorizationEndpoint,
      tokenEndpoint,
      timestamp: Date.now(),
    };

    const state = btoa(JSON.stringify(stateData));

    // Build OAuth authorization URL
    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", APP_CONFIG.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", APP_CONFIG.REDIRECT_URI);
    authUrl.searchParams.set("scope", "atproto transition:generic");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);

    return c.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error("OAuth start error:", error);
    return c.json({ error: "Failed to start OAuth flow" }, 500);
  }
});
```

## Step 6: OAuth Callback Handler

```typescript
app.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const errorDescription = c.req.query("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return c.json({
      error: `OAuth failed: ${error}`,
      description: errorDescription || "Unknown OAuth error",
    }, 400);
  }

  if (!code || !state) {
    return c.json({ error: "Missing authorization code or state" }, 400);
  }

  try {
    // Decode state data
    let stateData: any;
    try {
      stateData = JSON.parse(atob(state));
    } catch (parseError) {
      console.error("Failed to parse state:", parseError);
      return c.json({ error: "Invalid state format" }, 400);
    }

    // Check if state is expired (5 minutes)
    const stateAge = Date.now() - stateData.timestamp;
    if (stateAge > 5 * 60 * 1000) {
      return c.json({ error: "State expired" }, 400);
    }

    const { codeVerifier, handle, did, pdsEndpoint, tokenEndpoint } = stateData;

    // CRITICAL: Generate extractable DPoP key pair for this session
    const { privateKey: sessionPrivateKey, publicKey: sessionPublicKey } =
      await generateKeyPair("ES256", { extractable: true });

    // Prepare token exchange request
    const requestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: APP_CONFIG.REDIRECT_URI,
      client_id: APP_CONFIG.CLIENT_ID,
      code_verifier: codeVerifier,
    });

    // First attempt - without nonce
    const { dpopProof } = await generateDPoPProofWithKeys(
      "POST",
      tokenEndpoint,
      sessionPrivateKey,
      sessionPublicKey,
    );

    let tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP": dpopProof,
      },
      body: requestBody,
    });

    // Handle nonce requirement during token exchange
    if (!tokenResponse.ok && tokenResponse.status === 400) {
      try {
        const errorData = await tokenResponse.json();
        if (errorData.error === "use_dpop_nonce") {
          const nonce = tokenResponse.headers.get("DPoP-Nonce");
          if (nonce) {
            console.log("Retrying token exchange with DPoP nonce:", nonce);

            const { dpopProof: dpopProofWithNonce } =
              await generateDPoPProofWithKeys(
                "POST",
                tokenEndpoint,
                sessionPrivateKey,
                sessionPublicKey,
                undefined,
                nonce,
              );

            tokenResponse = await fetch(tokenEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "DPoP": dpopProofWithNonce,
              },
              body: requestBody,
            });
          }
        }
      } catch {
        // Continue to general error handling
      }
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText,
        tokenEndpoint,
      });
      return c.json({
        error: "Failed to exchange code for tokens",
        details: errorText,
        status: tokenResponse.status,
      }, 400);
    }

    const tokens = await tokenResponse.json();

    // Export keys to JWK format for storage
    console.log("Exporting DPoP keys to JWK format...");
    const privateKeyJWK = JSON.stringify(await exportJWK(sessionPrivateKey));
    const publicKeyJWK = JSON.stringify(await exportJWK(sessionPublicKey));

    // Store session data with DPoP keys
    const sessionData: OAuthSession = {
      did,
      handle,
      pdsUrl: pdsEndpoint,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      dpopPrivateKey: privateKeyJWK,
      dpopPublicKey: publicKeyJWK,
    };

    // Store the session in SQLite
    const now = Date.now();
    await sqlite.execute(
      `
      INSERT OR REPLACE INTO oauth_sessions 
      (did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        did,
        handle,
        pdsEndpoint,
        sessionData.accessToken,
        sessionData.refreshToken,
        sessionData.dpopPrivateKey,
        sessionData.dpopPublicKey,
        now,
        now,
      ],
    );

    console.log(`Session stored successfully for DID: ${did}`);

    // Redirect back to app with session
    const redirectUrl = new URL("/", c.req.url);
    redirectUrl.searchParams.set("session", btoa(JSON.stringify(sessionData)));

    return c.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("OAuth callback error:", error);
    return c.json({
      error: "OAuth callback failed",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
```

## Step 7: Using the Authenticated Session

### Reading Records

```typescript
app.get("/api/books", async (c) => {
  const sessionData = c.req.header("X-Session-Data");
  if (!sessionData) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const session = JSON.parse(atob(sessionData));
    const storedSession = await getStoredSession(session.did);

    if (!storedSession) {
      return c.json({ error: "Session expired" }, 401);
    }

    // Fetch records with cursor pagination
    const allRecords = [];
    let cursor = undefined;

    do {
      const url = new URL(
        `${session.pdsUrl}/xrpc/com.atproto.repo.listRecords`,
      );
      url.searchParams.set("repo", session.did);
      url.searchParams.set("collection", "buzz.bookhive.book");
      url.searchParams.set("limit", "100");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const result = await makeDPoPRequest(
        "GET",
        url.toString(),
        storedSession,
      );
      const response = result.response;

      if (!response.ok) break;

      const data = await response.json();
      allRecords.push(...data.records);
      cursor = data.cursor;

      if (!cursor || data.records.length === 0) break;
    } while (cursor);

    return c.json({ books: allRecords });
  } catch (error) {
    return c.json({ error: "Failed to fetch books" }, 500);
  }
});
```

### Writing Records

```typescript
app.put("/api/books/:uri/status", async (c) => {
  const uri = decodeURIComponent(c.req.param("uri"));
  const { status }: { status: BookStatus } = await c.req.json();
  const sessionData = c.req.header("X-Session-Data");

  if (!sessionData) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const session = JSON.parse(atob(sessionData));
    const did = session.did;

    // Parse AT URI
    const uriMatch = uri.match(/at:\/\/([^\/]+)\/([^\/]+)\/(.+)/);
    if (!uriMatch) {
      return c.json({ error: "Invalid AT URI format" }, 400);
    }

    const [, repo, collection, rkey] = uriMatch;

    // Verify ownership
    if (repo !== did) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Get stored session
    const storedSession = await getStoredSession(did);
    if (!storedSession) {
      return c.json({ error: "Authentication failed" }, 401);
    }

    // Get PDS endpoint from DID
    const didDoc = await fetch(`${APP_CONFIG.PLC_DIRECTORY}/${did}`);
    if (!didDoc.ok) {
      return c.json({ error: "Failed to resolve DID document" }, 500);
    }

    const didData = await didDoc.json();
    const pdsEndpoint = didData.service?.find((s: any) =>
      s.id === "#atproto_pds"
    )?.serviceEndpoint;

    if (!pdsEndpoint) {
      return c.json({ error: "Could not find PDS endpoint" }, 500);
    }

    // Get current record
    const getUrl =
      `${pdsEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${repo}&collection=${collection}&rkey=${rkey}`;
    const getResult = await makeDPoPRequest("GET", getUrl, storedSession);
    const getResponse = getResult.response;
    let currentSession = getResult.session;

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      return c.json(
        { error: "Failed to fetch current record" },
        getResponse.status,
      );
    }

    const currentRecord = await getResponse.json();

    // Update record with new status
    const updatedValue = {
      ...currentRecord.value,
      status: status,
    };

    // Put updated record
    const updateResult = await makeDPoPRequest(
      "POST",
      `${pdsEndpoint}/xrpc/com.atproto.repo.putRecord`,
      currentSession,
      JSON.stringify({
        repo,
        collection,
        rkey,
        record: updatedValue,
        swapRecord: currentRecord.cid,
      }),
    );
    const updateResponse = updateResult.response;

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();

      if (updateResponse.status === 401) {
        return c.json({
          error: "Authentication failed",
          message: "OAuth session expired. Please login again.",
        }, 401);
      }

      return c.json({
        error: "Failed to update record",
        message: errorText,
      }, updateResponse.status);
    }

    const result = await updateResponse.json();

    return c.json({
      success: true,
      message: `Status updated to ${status}`,
      uri: result.uri,
      cid: result.cid,
      newStatus: status,
    });
  } catch (error) {
    console.error("Update error:", error);
    return c.json({ error: "Failed to update book status" }, 500);
  }
});
```

## Critical Implementation Details

### 1. **Extractable DPoP Keys**

```typescript
// MUST be extractable for JWK export
const { privateKey, publicKey } = await generateKeyPair("ES256", {
  extractable: true,
});
```

### 2. **Session Persistence**

```typescript
// Store keys as JWK strings in database
const privateKeyJWK = JSON.stringify(await exportJWK(privateKey));
const publicKeyJWK = JSON.stringify(await exportJWK(publicKey));
```

### 3. **Consistent Key Usage**

```typescript
// Always use the same keys for the entire session
const privateKey = await importJWK(JSON.parse(session.dpopPrivateKey), "ES256");
const publicKey = await importJWK(JSON.parse(session.dpopPublicKey), "ES256");
```

### 4. **Automatic Token Refresh**

The system automatically handles expired tokens:

1. Detects `invalid_token` error responses
2. Uses refresh token to get new access token
3. Updates stored session with new tokens
4. Retries original request with fresh token

## Common Issues and Solutions

### 1. **"invalid_token" - Token Expired**

- **Detection**:
  `{"error":"invalid_token","message":"\"exp\" claim timestamp check failed"}`
- **Solution**: Automatic token refresh implemented in `makeDPoPRequest`

### 2. **"use_dpop_nonce" Error**

- **Detection**: Response header `DPoP-Nonce` present
- **Solution**: Extract nonce and retry with updated DPoP proof

### 3. **DPoP Key Binding Issues**

- **Cause**: Using different keys for token exchange vs. API calls
- **Solution**: Store and reuse the same extractable ES256 key pair

### 4. **Serverless State Management**

- **Cause**: OAuth state lost between requests
- **Solution**: Encode state data in the state parameter itself

## Testing Your Implementation

1. **Start OAuth Flow**: `POST /api/auth/start` with
   `{"handle": "user.bsky.social"}`
2. **Complete Authorization**: Follow the returned `authUrl`
3. **Verify Token Exchange**: Check successful callback handling
4. **Test API Operations**: Verify read/write operations work
5. **Test Token Refresh**: Wait for token expiration and verify auto-refresh

## Production Considerations

1. **HTTPS Required**: OAuth flows must use HTTPS
2. **Session Security**: Store DPoP keys securely in encrypted database
3. **Error Handling**: Implement comprehensive error handling and logging
4. **Rate Limiting**: Respect AT Protocol rate limits
5. **Token Cleanup**: Implement cleanup for expired sessions

## Working Example Structure

```
book-explorer/
├── backend/
│   └── index.ts              # Complete OAuth + API implementation
├── frontend/
│   ├── components/
│   │   ├── App.tsx           # Session management + UI
│   │   └── Login.tsx         # OAuth initiation
│   └── index.html
├── shared/
│   ├── config.ts             # OAuth configuration
│   └── types.ts              # TypeScript definitions
└── deno.json
```

## Final Result

✅ **Complete OAuth Implementation**: No app passwords required\
✅ **DPoP Key Binding**: Consistent authentication with stored keys\
✅ **Automatic Token Refresh**: Seamless handling of expired tokens\
✅ **Nonce Handling**: Anti-replay protection with retry logic\
✅ **Session Persistence**: Stateless operations with SQLite storage\
✅ **Production Ready**: Comprehensive error handling and edge cases

This implementation successfully provides complete OAuth authentication for
ATProto, enabling both reading and writing operations without requiring app
passwords. The book-explorer project demonstrates this working in production
with features like StoryGraph CSV import and bulk book status updates.
