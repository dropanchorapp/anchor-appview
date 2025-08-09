// OAuth endpoints implementation for ATProto authentication
import { exportJWK, generateKeyPair } from "https://esm.sh/jose@5.2.0";
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";
import { generateDPoPProofWithKeys, generatePKCE } from "./dpop.ts";
import { initializeOAuthTables, storeOAuthSession } from "./session.ts";
import { OAUTH_CONFIG } from "./config.ts";
import { BlueskyProfileFetcher } from "../utils/profile-resolver.ts";
import type { OAuthSession, OAuthStateData } from "./types.ts";

// OAuth client metadata endpoint
export function handleClientMetadata(): Response {
  const metadata = {
    "client_id": OAUTH_CONFIG.CLIENT_ID,
    "client_name": OAUTH_CONFIG.APP_NAME,
    "client_uri": OAUTH_CONFIG.BASE_URL,
    "logo_uri": `${OAUTH_CONFIG.BASE_URL}/favicon.ico`,
    "redirect_uris": [OAUTH_CONFIG.REDIRECT_URI],
    "scope": "atproto transition:generic",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "application_type": "web",
    "token_endpoint_auth_method": "none",
    "dpop_bound_access_tokens": true,
  };

  return new Response(JSON.stringify(metadata, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// OAuth start endpoint - initiates OAuth flow
export async function handleOAuthStart(request: Request): Promise<Response> {
  try {
    const { handle } = await request.json();

    if (!handle) {
      return new Response(JSON.stringify({ error: "Handle is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Resolve handle to DID
    let did: string | null = null;
    const handleParts = handle.split(".");
    const potentialPDS = handleParts.length >= 2
      ? `https://${handleParts.slice(-2).join(".")}`
      : null;

    // Try multiple resolution services
    const resolutionServices = [
      potentialPDS,
      OAUTH_CONFIG.ATPROTO_SERVICE,
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
      return new Response(
        JSON.stringify({ error: "Handle not found on any known service" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get user's DID document to find PDS
    const didDocResponse = await fetch(`${OAUTH_CONFIG.PLC_DIRECTORY}/${did}`);
    if (!didDocResponse.ok) {
      return new Response(JSON.stringify({ error: "Could not resolve DID" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const didDoc = await didDocResponse.json();
    const pdsEndpoint = didDoc.service?.find((s: any) =>
      s.id === "#atproto_pds"
    )?.serviceEndpoint;

    if (!pdsEndpoint) {
      return new Response(
        JSON.stringify({ error: "Could not find PDS endpoint" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Discover OAuth protected resource metadata
    const resourceMetadataResponse = await fetch(
      `${pdsEndpoint}/.well-known/oauth-protected-resource`,
    );

    if (!resourceMetadataResponse.ok) {
      return new Response(
        JSON.stringify({ error: "PDS does not support OAuth" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const resourceMetadata = await resourceMetadataResponse.json();
    const authServerUrl = resourceMetadata.authorization_servers?.[0];

    if (!authServerUrl) {
      return new Response(
        JSON.stringify({ error: "No authorization server found" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Discover OAuth authorization server metadata
    const authServerMetadataResponse = await fetch(
      `${authServerUrl}/.well-known/oauth-authorization-server`,
    );

    if (!authServerMetadataResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Could not get authorization server metadata",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const authServerMetadata = await authServerMetadataResponse.json();
    const authorizationEndpoint = authServerMetadata.authorization_endpoint;
    const tokenEndpoint = authServerMetadata.token_endpoint;

    if (!authorizationEndpoint || !tokenEndpoint) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization server metadata" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Generate OAuth parameters
    const { codeVerifier, codeChallenge, codeChallengeMethod } =
      await generatePKCE();

    // Encode state data for serverless compatibility
    const stateData: OAuthStateData = {
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
    authUrl.searchParams.set("client_id", OAUTH_CONFIG.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.REDIRECT_URI);
    authUrl.searchParams.set("scope", "atproto transition:generic");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);

    return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OAuth start error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to start OAuth flow" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// OAuth callback handler - completes token exchange
export async function handleOAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>OAuth Error</h1>
          <p>Error: ${error}</p>
          <p>Description: ${errorDescription || "Unknown OAuth error"}</p>
          <a href="/">Return to Dashboard</a>
        </body>
      </html>
    `,
      {
        status: 400,
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  if (!code || !state) {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>OAuth Error</h1>
          <p>Missing authorization code or state</p>
          <a href="/">Return to Dashboard</a>
        </body>
      </html>
    `,
      {
        status: 400,
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  try {
    // Initialize OAuth tables
    await initializeOAuthTables();

    // Decode state data
    let stateData: OAuthStateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (parseError) {
      console.error("Failed to parse state:", parseError);
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>Invalid state format</p>
            <a href="/">Return to Dashboard</a>
          </body>
        </html>
      `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    // Check if state is expired (5 minutes)
    const stateAge = Date.now() - stateData.timestamp;
    if (stateAge > 5 * 60 * 1000) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>State expired</p>
            <a href="/">Return to Dashboard</a>
          </body>
        </html>
      `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    const { codeVerifier, handle, did, pdsEndpoint, tokenEndpoint } = stateData;

    // CRITICAL: Generate extractable DPoP key pair for this session
    const { privateKey: sessionPrivateKey, publicKey: sessionPublicKey } =
      await generateKeyPair("ES256", { extractable: true });

    // Prepare token exchange request
    const requestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
      client_id: OAUTH_CONFIG.CLIENT_ID,
      code_verifier: codeVerifier,
    });

    // First attempt - without nonce
    const { dpopProof } = await generateDPoPProofWithKeys(
      "POST",
      tokenEndpoint,
      sessionPrivateKey as CryptoKey,
      sessionPublicKey as CryptoKey,
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
                sessionPrivateKey as CryptoKey,
                sessionPublicKey as CryptoKey,
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
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>Failed to exchange code for tokens</p>
            <p>Status: ${tokenResponse.status}</p>
            <p>Details: ${errorText}</p>
            <a href="/">Return to Dashboard</a>
          </body>
        </html>
      `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
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
    await storeOAuthSession(sessionData);

    console.log(`Session stored successfully for DID: ${did}`);

    // Fetch user's profile to get avatar and display name
    const profileFetcher = new BlueskyProfileFetcher();
    const userProfile = await profileFetcher.fetchProfile(did);

    // Set secure session cookie
    const sessionId = crypto.randomUUID();

    // Store session ID and profile info in database for this user
    await sqlite.execute(
      `UPDATE oauth_sessions SET session_id = ?, display_name = ?, avatar_url = ? WHERE did = ?`,
      [
        sessionId,
        userProfile?.displayName || null,
        userProfile?.avatar || null,
        did,
      ],
    );

    // Redirect back to app with success and set session cookie
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("login", "success");
    redirectUrl.searchParams.set("handle", handle);
    redirectUrl.searchParams.set("did", did);
    if (userProfile?.avatar) {
      redirectUrl.searchParams.set("avatar", userProfile.avatar);
    }
    if (userProfile?.displayName) {
      redirectUrl.searchParams.set("displayName", userProfile.displayName);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        "Set-Cookie":
          `anchor_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${
            30 * 24 * 60 * 60
          }; Path=/`,
      },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>OAuth Error</h1>
          <p>OAuth callback failed</p>
          <p>Details: ${
        error instanceof Error ? error.message : String(error)
      }</p>
          <a href="/">Return to Dashboard</a>
        </body>
      </html>
    `,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      },
    );
  }
}
