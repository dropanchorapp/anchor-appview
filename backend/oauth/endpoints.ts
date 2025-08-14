// OAuth endpoints implementation for ATProto authentication
import { exportJWK, generateKeyPair } from "https://esm.sh/jose@5.2.0";
import { sqlite } from "https://esm.town/v/std/sqlite2";
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
    // Optional but recommended fields
    "tos_uri": `${OAUTH_CONFIG.BASE_URL}/terms`,
    "policy_uri": `${OAUTH_CONFIG.BASE_URL}/privacy`,
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

    // Detect mobile app context
    const userAgent = request.headers.get("User-Agent") || "";
    const referer = request.headers.get("Referer") || "";
    const isMobileApp = userAgent.includes("AnchorApp") ||
      referer.includes("/mobile-auth") ||
      (userAgent.includes("iPhone") && userAgent.includes("Mobile"));

    console.log(
      `🔍 Mobile app detection - User-Agent: ${userAgent}, Referer: ${referer}, IsMobile: ${isMobileApp}`,
    );

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
      isMobileApp,
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
    authUrl.searchParams.set("login_hint", handle); // Prefill the handle in OAuth form

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

    // Log the actual token response for debugging
    console.log("Token response from Bluesky:", {
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      scope: tokens.scope,
    });

    // Export keys to JWK format for storage
    console.log("Exporting DPoP keys to JWK format...");
    const privateKeyJWK = JSON.stringify(await exportJWK(sessionPrivateKey));
    const publicKeyJWK = JSON.stringify(await exportJWK(sessionPublicKey));

    // Calculate actual token expiration from Bluesky response
    const tokenExpiresAt = tokens.expires_in
      ? Date.now() + (tokens.expires_in * 1000)
      : Date.now() + (2 * 60 * 60 * 1000); // 2 hours default

    // Store session data with DPoP keys
    const sessionData: OAuthSession = {
      did,
      handle,
      pdsUrl: pdsEndpoint,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      dpopPrivateKey: privateKeyJWK,
      dpopPublicKey: publicKeyJWK,
      tokenExpiresAt,
    };

    // Store the session in SQLite
    await storeOAuthSession(sessionData);

    console.log(`Session stored successfully for DID: ${did}`);

    // Register user for PDS crawling
    try {
      const { registerUser } = await import("../database/user-tracking.ts");
      await registerUser(did, handle, pdsEndpoint);
      console.log(`📝 Registered user ${handle} for PDS crawling`);
    } catch (error) {
      console.error(`❌ Failed to register user for crawling:`, error);
      // Don't fail the OAuth flow if user registration fails
    }

    // Fetch user's profile to get avatar and display name
    const profileFetcher = new BlueskyProfileFetcher();
    const userProfile = await profileFetcher.fetchProfile(did);

    // Set secure session cookie
    const sessionId = crypto.randomUUID();

    // Store session ID and profile info in database for this user
    await sqlite.execute({
      sql:
        `UPDATE oauth_sessions SET session_id = ?, display_name = ?, avatar_url = ? WHERE did = ?`,
      args: [
        sessionId,
        userProfile?.displayName || null,
        userProfile?.avatar || null,
        did,
      ],
    });

    // Use stored mobile app flag from OAuth state
    const isMobileApp = stateData.isMobileApp || false;
    console.log(`📱 Using stored mobile app flag: ${isMobileApp}`);

    if (isMobileApp) {
      // For mobile apps, use the session_id as a temporary authorization code
      // The tokens are already stored in oauth_sessions table - client will exchange session_id for tokens
      const mobileRedirectUrl = new URL("anchor-app://auth-callback");
      mobileRedirectUrl.searchParams.set("code", sessionId);

      // Return a success page that triggers the mobile redirect
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                color: white;
                text-align: center;
              }

              .container {
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 40px 30px;
                max-width: 400px;
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.2);
              }

              .success-icon {
                width: 80px;
                height: 80px;
                margin: 0 auto 24px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
              }

              h1 {
                font-size: 24px;
                font-weight: 700;
                margin-bottom: 16px;
              }

              p {
                opacity: 0.9;
                margin-bottom: 24px;
              }

              .redirect-info {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 16px;
                margin-top: 20px;
                font-size: 14px;
                opacity: 0.8;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>Authentication Successful!</h1>
              <p>You're being redirected back to the Anchor app...</p>
              <div class="redirect-info">
                If you're not redirected automatically, please return to the Anchor app.
              </div>
            </div>
            
            <script>
              // Immediately redirect to the mobile app
              window.location.href = "${mobileRedirectUrl.toString()}";
              
              // Fallback: try again after a short delay
              setTimeout(() => {
                window.location.href = "${mobileRedirectUrl.toString()}";
              }, 1000);
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Set-Cookie":
              `anchor_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${
                30 * 24 * 60 * 60
              }; Path=/`,
          },
        },
      );
    }

    // For web browsers, redirect back to app with success and set session cookie
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

// Mobile token exchange endpoint - exchange authorization code for tokens
export async function handleMobileTokenExchange(
  request: Request,
): Promise<Response> {
  try {
    const { code } = await request.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Authorization code is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Initialize OAuth tables
    await initializeOAuthTables();

    // Find session by session_id (which is the code we sent to mobile)
    const result = await sqlite.execute({
      sql:
        `SELECT * FROM oauth_sessions WHERE session_id = ? AND updated_at > ?`,
      args: [code, Date.now() - (10 * 60 * 1000)], // Code expires in 10 minutes
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authorization code" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const session = result.rows[0] as any;

    // Use a reasonable token expiration - Bluesky tokens typically last 2-24 hours
    // This will be properly handled by automatic refresh when tokens expire
    const expiresInSeconds = 4 * 60 * 60; // 4 hours
    const expiresAt = new Date(Date.now() + (expiresInSeconds * 1000));

    // Return token data with proper expiration info
    const tokenResponse = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: expiresInSeconds, // Standard OAuth field - seconds until expiration
      expires_at: expiresAt.toISOString(), // ISO timestamp for convenience
      token_type: "Bearer",
      scope: "atproto",
      // User info
      did: session.did,
      handle: session.handle,
      pds_url: session.pds_url,
      session_id: session.session_id,
      // Optional profile data
      ...(session.display_name && { display_name: session.display_name }),
      ...(session.avatar_url && { avatar: session.avatar_url }),
    };

    // Optional: Invalidate the session_id so it can't be reused
    await sqlite.execute({
      sql: `UPDATE oauth_sessions SET session_id = NULL WHERE session_id = ?`,
      args: [code],
    });

    console.log(`🔄 Mobile token exchange successful for ${session.handle}`);

    return new Response(JSON.stringify(tokenResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Mobile token exchange error:", error);
    return new Response(JSON.stringify({ error: "Token exchange failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
