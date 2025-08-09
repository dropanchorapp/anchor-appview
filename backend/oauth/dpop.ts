// DPoP (Demonstration of Proof-of-Possession) implementation for ATProto OAuth
import { exportJWK, importJWK, SignJWT } from "https://esm.sh/jose@5.2.0";
import { OAUTH_CONFIG } from "./config.ts";
import type { OAuthSession } from "./types.ts";

// Generate PKCE parameters for OAuth flow
export async function generatePKCE() {
  const codeVerifier = generateRandomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
    .replace(/=/g, "");

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

// Generate random string for PKCE
function generateRandomString(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

// Generate DPoP proof JWT with JWK directly (avoids extractability issues)
export async function generateDPoPProofWithJWK(
  method: string,
  url: string,
  privateKey: CryptoKey,
  publicKeyJWK: any,
  accessToken?: string,
  nonce?: string,
) {
  // Use the provided public key JWK directly
  const jwk = publicKeyJWK;

  // Create DPoP JWT payload
  const payload: any = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };

  if (accessToken) {
    payload.ath = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(accessToken),
          ),
        ),
      ),
    ).replace(/[+/]/g, (match) => match === "+" ? "-" : "_").replace(/=/g, "");
  }

  if (nonce) {
    payload.nonce = nonce;
  }

  const dpopProof = await new SignJWT(payload)
    .setProtectedHeader({
      typ: "dpop+jwt",
      alg: "ES256",
      jwk: jwk,
    })
    .sign(privateKey);

  return { dpopProof };
}

// Generate DPoP proof JWT with keys
export async function generateDPoPProofWithKeys(
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

// Make authenticated request with DPoP proof using mixed CryptoKey/JWK approach
export async function makeDPoPRequestWithKeys(
  method: string,
  url: string,
  session: {
    did: string;
    handle: string;
    accessToken: string;
    refreshToken: string;
    dpopPrivateKey: CryptoKey;
    dpopPublicKey: CryptoKey;
    dpopPublicKeyJWK: any; // Raw JWK for public key
    pdsUrl: string;
  },
  body?: string,
): Promise<Response> {
  // First attempt - without nonce
  const { dpopProof } = await generateDPoPProofWithJWK(
    method,
    url,
    session.dpopPrivateKey,
    session.dpopPublicKeyJWK,
    session.accessToken,
  );

  const headers: HeadersInit = {
    "Authorization": `DPoP ${session.accessToken}`,
    "DPoP": dpopProof,
    "Content-Type": "application/json",
  };

  let response = await fetch(url, {
    method,
    headers,
    body,
  });

  // If we get a 401 with DPoP nonce, retry with the nonce
  if (response.status === 401) {
    const dpopNonce = response.headers.get("DPoP-Nonce");
    if (dpopNonce) {
      console.log("Retrying request with DPoP nonce");
      const { dpopProof: nonceProof } = await generateDPoPProofWithJWK(
        method,
        url,
        session.dpopPrivateKey,
        session.dpopPublicKeyJWK,
        session.accessToken,
        dpopNonce,
      );

      headers["DPoP"] = nonceProof;
      response = await fetch(url, {
        method,
        headers,
        body,
      });
    }
  }

  return response;
}

// Make DPoP authenticated request with auto-refresh
export async function makeDPoPRequest(
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

// Refresh OAuth token using refresh token
export async function refreshOAuthToken(
  session: OAuthSession,
): Promise<OAuthSession | null> {
  try {
    console.log(`Refreshing OAuth token for ${session.handle}`);

    // Get the user's token endpoint from their PDS
    const didDocResponse = await fetch(`https://plc.directory/${session.did}`);
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
      client_id: OAUTH_CONFIG.CLIENT_ID,
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
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");
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
