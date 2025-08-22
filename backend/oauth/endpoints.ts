// OAuth endpoints implementation for ATProto authentication
import { exportJWK, generateKeyPair } from "https://esm.sh/jose@5.2.0";
import { sqlite } from "https://esm.town/v/std/sqlite2";
import { generatePKCE } from "./dpop.ts";
import { OAUTH_CONFIG } from "./config.ts";
import { BlueskyProfileFetcher } from "../utils/profile-resolver.ts";
import { setupOAuthWithSlingshot } from "./slingshot-resolver.ts";
import { cleanupExpiredOAuthSessions } from "./session-cleanup.ts";
import type { OAuthStateData } from "./types.ts";

// OAuth client metadata endpoint
export function handleClientMetadata(): Response {
  const metadata = {
    "client_id": OAUTH_CONFIG.CLIENT_ID,
    "client_name": OAUTH_CONFIG.APP_NAME,
    "client_uri": OAUTH_CONFIG.BASE_URL,
    "logo_uri": `${OAUTH_CONFIG.BASE_URL}/favicon.ico`,
    "redirect_uris": [
      OAUTH_CONFIG.REDIRECT_URI,
      `${OAUTH_CONFIG.BASE_URL}/oauth/mobile-callback`,
    ],
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

// Web OAuth start endpoint - initiates OAuth flow for web dashboard
export async function handleOAuthStart(request: Request): Promise<Response> {
  try {
    // Cleanup expired sessions periodically
    await cleanupExpiredOAuthSessions();

    const { handle: rawHandle } = await request.json();

    if (!rawHandle) {
      return new Response(JSON.stringify({ error: "Handle is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Normalize handle by removing invisible Unicode characters and trimming
    const handle = rawHandle
      .trim()
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "") // Remove directional marks
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ") // Normalize spaces
      .trim()
      .toLowerCase();

    console.log(`🔍 Normalized handle: "${rawHandle}" → "${handle}"`);

    if (!handle) {
      return new Response(JSON.stringify({ error: "Invalid handle format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use simplified Slingshot OAuth setup
    const oauthSetup = await setupOAuthWithSlingshot(handle);

    // Generate OAuth parameters
    const { codeVerifier, codeChallenge, codeChallengeMethod } =
      await generatePKCE();

    // For web OAuth, store codeVerifier securely in database with session ID
    const webSessionId = crypto.randomUUID();

    // Store web session securely for OAuth callback
    await sqlite.execute({
      sql: `INSERT OR REPLACE INTO oauth_sessions 
        (did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, 
         token_expires_at, session_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        oauthSetup.did,
        oauthSetup.handle,
        oauthSetup.pdsEndpoint,
        "WEB_PENDING",
        "WEB_PENDING",
        codeVerifier, // Securely store web's PKCE verifier in database
        "WEB_PENDING",
        0,
        webSessionId,
        Date.now(),
        Date.now(),
      ],
    });

    // Encode secure state data with session ID reference (no sensitive data!)
    const stateData: OAuthStateData = {
      handle: oauthSetup.handle,
      did: oauthSetup.did,
      pdsEndpoint: oauthSetup.pdsEndpoint,
      authorizationEndpoint: oauthSetup.authorizationEndpoint,
      tokenEndpoint: oauthSetup.tokenEndpoint,
      timestamp: Date.now(),
      sessionId: webSessionId, // Include session ID for web callback lookup
    };

    const state = btoa(JSON.stringify(stateData));

    // Build OAuth authorization URL
    const authUrl = new URL(oauthSetup.authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", OAUTH_CONFIG.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.REDIRECT_URI);
    authUrl.searchParams.set("scope", "atproto transition:generic");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
    authUrl.searchParams.set("login_hint", oauthSetup.handle); // Prefill the handle in OAuth form

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

// Mobile OAuth start endpoint - initiates OAuth flow for mobile apps with PKCE security
export async function handleMobileOAuthStart(
  request: Request,
): Promise<Response> {
  try {
    // Cleanup expired sessions periodically
    await cleanupExpiredOAuthSessions();

    const { handle: rawHandle, code_challenge } = await request.json();

    if (!rawHandle) {
      return new Response(JSON.stringify({ error: "Handle is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!code_challenge) {
      return new Response(
        JSON.stringify({
          error: "code_challenge is required for mobile PKCE security",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(`🔄 Starting secure mobile OAuth for handle: ${rawHandle}`);

    // Use simplified Slingshot OAuth setup
    const oauthSetup = await setupOAuthWithSlingshot(rawHandle);

    // Generate PKCE parameters for server-side OAuth flow
    const {
      codeVerifier,
      codeChallenge: serverCodeChallenge,
      codeChallengeMethod,
    } = await generatePKCE();

    // Create unique session ID for this OAuth flow
    const sessionId = crypto.randomUUID();

    // Store mobile PKCE challenge and server PKCE verifier in database for later validation
    await sqlite.execute({
      sql: `INSERT OR REPLACE INTO oauth_sessions 
        (did, handle, pds_url, access_token, refresh_token, dpop_private_key, dpop_public_key, 
         token_expires_at, session_id, mobile_code_challenge, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        oauthSetup.did,
        oauthSetup.handle,
        oauthSetup.pdsEndpoint,
        "PENDING", // Placeholder until token exchange
        "PENDING", // Placeholder until token exchange
        codeVerifier, // Store server's PKCE verifier for OAuth provider exchange
        "PENDING", // Placeholder until token exchange
        0, // Will be updated during token exchange
        sessionId,
        code_challenge, // Store mobile app's PKCE challenge for mobile validation
        Date.now(),
        Date.now(),
      ],
    });

    // Encode secure state data (no sensitive codeVerifier!)
    const stateData: OAuthStateData = {
      handle: oauthSetup.handle,
      did: oauthSetup.did,
      pdsEndpoint: oauthSetup.pdsEndpoint,
      authorizationEndpoint: oauthSetup.authorizationEndpoint,
      tokenEndpoint: oauthSetup.tokenEndpoint,
      timestamp: Date.now(),
      sessionId: sessionId, // Include session ID for mobile callback lookup
    };

    const state = btoa(JSON.stringify(stateData));

    // Build OAuth authorization URL with mobile callback
    const authUrl = new URL(oauthSetup.authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", OAUTH_CONFIG.CLIENT_ID);
    authUrl.searchParams.set(
      "redirect_uri",
      `${OAUTH_CONFIG.BASE_URL}/oauth/mobile-callback`,
    );
    authUrl.searchParams.set("scope", "atproto transition:generic");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", serverCodeChallenge); // Server's PKCE challenge
    authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
    authUrl.searchParams.set("login_hint", oauthSetup.handle);

    console.log(
      `🔗 Secure mobile OAuth URL generated for ${oauthSetup.handle}`,
    );

    return new Response(
      JSON.stringify({
        authUrl: authUrl.toString(),
        handle: oauthSetup.handle,
        did: oauthSetup.did,
        session_id: sessionId, // Return session ID for mobile app to use in exchange
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Mobile OAuth start error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to start OAuth flow" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Web OAuth callback handler - completes token exchange for web dashboard
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
    // OAuth tables are now initialized by Drizzle migrations

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

    const { handle, did, pdsEndpoint, tokenEndpoint } = stateData;
    const webSessionId = stateData.sessionId;

    if (!webSessionId) {
      console.error("No session ID found in state for web OAuth");
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>Invalid OAuth state - missing session ID</p>
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

    // Get stored web session and code verifier using session ID for better security
    const webSessionResult = await sqlite.execute({
      sql:
        `SELECT dpop_private_key AS web_code_verifier FROM oauth_sessions WHERE session_id = ? AND access_token = 'WEB_PENDING'`,
      args: [webSessionId],
    });

    if (!webSessionResult.rows || webSessionResult.rows.length === 0) {
      console.error(
        "No pending web session found for session ID:",
        webSessionId,
      );
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>OAuth Error</h1>
            <p>Web session not found or expired</p>
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

    const webCodeVerifier = webSessionResult.rows[0]
      .web_code_verifier as string;

    // CRITICAL: Generate extractable DPoP key pair for this session
    const { privateKey: sessionPrivateKey, publicKey: sessionPublicKey } =
      await generateKeyPair("ES256", { extractable: true });

    // Prepare token exchange request
    const requestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
      client_id: OAUTH_CONFIG.CLIENT_ID,
      code_verifier: webCodeVerifier,
    });

    // Exchange tokens using reusable DPoP function
    const { exchangeTokenWithDPoP } = await import("./dpop.ts");
    const tokenResponse = await exchangeTokenWithDPoP(
      tokenEndpoint,
      requestBody,
      sessionPrivateKey as CryptoKey,
      sessionPublicKey as CryptoKey,
    );

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

    // Update the temporary web session with actual tokens
    await sqlite.execute({
      sql: `UPDATE oauth_sessions 
        SET access_token = ?, refresh_token = ?, dpop_private_key = ?, dpop_public_key = ?, 
            token_expires_at = ?, updated_at = ?
        WHERE session_id = ? AND access_token = 'WEB_PENDING'`,
      args: [
        tokens.access_token,
        tokens.refresh_token,
        privateKeyJWK,
        publicKeyJWK,
        tokenExpiresAt,
        Date.now(),
        webSessionId,
      ],
    });

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

    // Web OAuth flow - redirect to dashboard

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

// Mobile OAuth callback handler - securely stores OAuth tokens and returns session ID to mobile app
export async function handleMobileOAuthCallback(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("Mobile OAuth error:", error, errorDescription);
    const redirectUrl = new URL("anchor-app://auth-callback");
    redirectUrl.searchParams.set("error", error);
    redirectUrl.searchParams.set(
      "error_description",
      errorDescription || "Unknown OAuth error",
    );

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="text-align: center; padding: 40px; font-family: system-ui;">
            <h1>❌ Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Redirecting to the Anchor app...</p>
            <script>
              window.location.href = "${redirectUrl.toString()}";
            </script>
          </div>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code || !state) {
    const redirectUrl = new URL("anchor-app://auth-callback");
    redirectUrl.searchParams.set("error", "invalid_request");
    redirectUrl.searchParams.set(
      "error_description",
      "Missing authorization code or state",
    );

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="text-align: center; padding: 40px; font-family: system-ui;">
            <h1>❌ Authentication Failed</h1>
            <p>Missing authorization code or state</p>
            <p>Redirecting to the Anchor app...</p>
            <script>
              window.location.href = "${redirectUrl.toString()}";
            </script>
          </div>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    // Decode state data
    let stateData: OAuthStateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (parseError) {
      console.error("Failed to parse OAuth state:", parseError);
      throw new Error("Invalid OAuth state");
    }

    const { handle, tokenEndpoint, sessionId } = stateData;

    // Find session by session ID to get mobile PKCE challenge and server code verifier
    const sessionResult = await sqlite.execute({
      sql:
        `SELECT session_id, mobile_code_challenge, dpop_private_key AS server_code_verifier FROM oauth_sessions WHERE session_id = ? AND access_token = 'PENDING'`,
      args: [sessionId],
    });

    if (!sessionResult.rows || sessionResult.rows.length === 0) {
      console.error("No pending session found for session ID:", sessionId);
      throw new Error("Session not found");
    }

    const sessionRow = sessionResult.rows[0];
    const serverCodeVerifier = sessionRow.server_code_verifier as string;

    // Generate DPoP key pair for token exchange
    const { privateKey, publicKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const privateKeyJWK = JSON.stringify(
      await exportJWK(privateKey),
    );
    const publicKeyJWK = JSON.stringify(await exportJWK(publicKey));

    // Exchange authorization code for tokens using stored server PKCE verifier
    const requestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${OAUTH_CONFIG.BASE_URL}/oauth/mobile-callback`,
      client_id: OAUTH_CONFIG.CLIENT_ID,
      code_verifier: serverCodeVerifier, // Use stored server PKCE verifier
    });

    const { exchangeTokenWithDPoP } = await import("./dpop.ts");
    const tokenResponse = await exchangeTokenWithDPoP(
      tokenEndpoint,
      requestBody,
      privateKey as CryptoKey,
      publicKey as CryptoKey,
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      throw new Error("Token exchange failed");
    }

    const tokens = await tokenResponse.json();

    // Calculate token expiration
    const tokenExpiresAt = tokens.expires_in
      ? Date.now() + (tokens.expires_in * 1000)
      : Date.now() + (2 * 60 * 60 * 1000); // 2 hours default

    // Update session with actual tokens
    await sqlite.execute({
      sql: `UPDATE oauth_sessions 
        SET access_token = ?, refresh_token = ?, dpop_private_key = ?, dpop_public_key = ?, 
            token_expires_at = ?, updated_at = ?
        WHERE session_id = ?`,
      args: [
        tokens.access_token,
        tokens.refresh_token,
        privateKeyJWK,
        publicKeyJWK,
        tokenExpiresAt,
        Date.now(),
        sessionId,
      ],
    });

    console.log(
      `🔄 Mobile OAuth callback completed for ${handle}, session: ${sessionId}`,
    );

    // Redirect to mobile app with session ID (NOT the OAuth code)
    const redirectUrl = new URL("anchor-app://auth-callback");
    redirectUrl.searchParams.set("code", sessionId); // This is now the session ID, not OAuth code
    redirectUrl.searchParams.set("state", state);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="text-align: center; padding: 40px; font-family: system-ui;">
            <h1>🎉 Authentication Successful!</h1>
            <p>Redirecting to the Anchor app...</p>
            <p>If the app doesn't open automatically, you can close this window.</p>
            <script>
              // Redirect to mobile app with session ID
              window.location.href = "${redirectUrl.toString()}";
            </script>
          </div>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Mobile OAuth callback error:", error);

    const redirectUrl = new URL("anchor-app://auth-callback");
    redirectUrl.searchParams.set("error", "server_error");
    redirectUrl.searchParams.set(
      "error_description",
      error instanceof Error ? error.message : "OAuth callback failed",
    );

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="text-align: center; padding: 40px; font-family: system-ui;">
            <h1>❌ Authentication Failed</h1>
            <p>OAuth callback failed</p>
            <p>Redirecting to the Anchor app...</p>
            <script>
              window.location.href = "${redirectUrl.toString()}";
            </script>
          </div>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }
}

// Mobile session retrieval endpoint - get credentials by session ID (for completed sessions)
export async function handleMobileSessionRetrieval(
  request: Request,
): Promise<Response> {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "sessionId is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(`🔄 Mobile session retrieval for session: ${sessionId}`);

    // Get completed session
    const sessionResult = await sqlite.execute({
      sql:
        `SELECT * FROM oauth_sessions WHERE session_id = ? AND access_token != 'PENDING' AND access_token != 'WEB_PENDING'`,
      args: [sessionId],
    });

    if (!sessionResult.rows || sessionResult.rows.length === 0) {
      console.error("No completed session found for session ID:", sessionId);
      return new Response(
        JSON.stringify({ error: "Invalid or incomplete session ID" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const sessionRow = sessionResult.rows[0];
    const handle = sessionRow.handle as string;
    const did = sessionRow.did as string;
    const accessToken = sessionRow.access_token as string;
    const refreshToken = sessionRow.refresh_token as string;
    const pdsUrl = sessionRow.pds_url as string;

    console.log(`✅ Mobile session retrieved for @${handle}`);

    return new Response(
      JSON.stringify({
        handle,
        did,
        accessToken,
        refreshToken,
        pdsUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Mobile session retrieval error:", error);
    return new Response(
      JSON.stringify({ error: "Session retrieval failed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Mobile token exchange endpoint - exchange session ID for tokens with PKCE validation
export async function handleMobileTokenExchange(
  request: Request,
): Promise<Response> {
  try {
    const { code: sessionId, code_verifier } = await request.json();

    if (!sessionId || !code_verifier) {
      return new Response(
        JSON.stringify({ error: "session_id and code_verifier are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(`🔄 Mobile token exchange for session: ${sessionId}`);

    // Get session with stored mobile PKCE challenge
    const sessionResult = await sqlite.execute({
      sql:
        `SELECT * FROM oauth_sessions WHERE session_id = ? AND access_token != 'PENDING'`,
      args: [sessionId],
    });

    if (!sessionResult.rows || sessionResult.rows.length === 0) {
      console.error("No completed session found for session ID:", sessionId);
      return new Response(
        JSON.stringify({ error: "Invalid session ID" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const sessionRow = sessionResult.rows[0];
    const storedMobileChallenge = sessionRow.mobile_code_challenge as string;

    if (!storedMobileChallenge) {
      console.error("No mobile PKCE challenge stored for session:", sessionId);
      return new Response(
        JSON.stringify({ error: "Session missing PKCE challenge" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate mobile PKCE: SHA256(code_verifier) should equal stored code_challenge
    const encoder = new TextEncoder();
    const data = encoder.encode(code_verifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedChallenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    if (computedChallenge !== storedMobileChallenge) {
      console.error("Mobile PKCE validation failed for session:", sessionId);
      return new Response(
        JSON.stringify({ error: "Invalid code_verifier" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `✅ Mobile PKCE validation successful for session: ${sessionId}`,
    );

    // Get user profile for mobile response
    const profileFetcher = new BlueskyProfileFetcher();
    const profile = await profileFetcher.fetchProfile(sessionRow.did as string);

    // Update profile info in database
    await sqlite.execute({
      sql:
        `UPDATE oauth_sessions SET display_name = ?, avatar_url = ?, updated_at = ? WHERE session_id = ?`,
      args: [
        profile?.displayName || null,
        profile?.avatar || null,
        Date.now(),
        sessionId,
      ],
    });

    // Register user for PDS crawling
    try {
      const { registerUser } = await import("../database/user-tracking.ts");
      await registerUser(
        sessionRow.did as string,
        sessionRow.handle as string,
        sessionRow.pds_url as string,
      );
      console.log(
        `📝 Registered mobile user ${sessionRow.handle} for PDS crawling`,
      );
    } catch (registrationError) {
      console.error(
        `Failed to register user ${sessionRow.handle}:`,
        registrationError,
      );
    }

    // Return complete authentication data following OAuth 2.1 spec
    const authResponse = {
      access_token: sessionRow.access_token as string,
      refresh_token: sessionRow.refresh_token as string,
      expires_in: Math.floor(
        ((sessionRow.token_expires_at as number) - Date.now()) / 1000,
      ), // Seconds until expiration
      token_type: "Bearer",
      scope: "atproto transition:generic",
      // User info
      did: sessionRow.did as string,
      handle: sessionRow.handle as string,
      pds_url: sessionRow.pds_url as string,
      session_id: sessionId,
      // Optional profile data
      ...(profile?.displayName && { display_name: profile.displayName }),
      ...(profile?.avatar && { avatar: profile.avatar }),
    };

    console.log(
      `🔄 Secure mobile token exchange successful for ${sessionRow.handle}`,
    );

    return new Response(JSON.stringify(authResponse), {
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
