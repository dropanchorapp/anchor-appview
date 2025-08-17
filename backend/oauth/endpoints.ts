// OAuth endpoints implementation for ATProto authentication
import { exportJWK, generateKeyPair } from "https://esm.sh/jose@5.2.0";
import { sqlite } from "https://esm.town/v/std/sqlite2";
import { generatePKCE } from "./dpop.ts";
import { storeOAuthSession } from "./session.ts";
import { OAUTH_CONFIG } from "./config.ts";
import { BlueskyProfileFetcher } from "../utils/profile-resolver.ts";
import { setupOAuthWithSlingshot } from "./slingshot-resolver.ts";
import type { OAuthSession, OAuthStateData } from "./types.ts";

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

    // Encode state data for serverless compatibility
    const stateData: OAuthStateData = {
      codeVerifier,
      handle: oauthSetup.handle,
      did: oauthSetup.did,
      pdsEndpoint: oauthSetup.pdsEndpoint,
      authorizationEndpoint: oauthSetup.authorizationEndpoint,
      tokenEndpoint: oauthSetup.tokenEndpoint,
      timestamp: Date.now(),
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

// Mobile OAuth start endpoint - initiates OAuth flow for mobile apps
export async function handleMobileOAuthStart(
  request: Request,
): Promise<Response> {
  try {
    const { handle: rawHandle } = await request.json();

    if (!rawHandle) {
      return new Response(JSON.stringify({ error: "Handle is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`🔄 Starting mobile OAuth for handle: ${rawHandle}`);

    // Use simplified Slingshot OAuth setup
    const oauthSetup = await setupOAuthWithSlingshot(rawHandle);

    // Generate PKCE parameters
    const { codeVerifier, codeChallenge, codeChallengeMethod } =
      await generatePKCE();

    // Encode state data for serverless compatibility
    const stateData: OAuthStateData = {
      codeVerifier,
      handle: oauthSetup.handle,
      did: oauthSetup.did,
      pdsEndpoint: oauthSetup.pdsEndpoint,
      authorizationEndpoint: oauthSetup.authorizationEndpoint,
      tokenEndpoint: oauthSetup.tokenEndpoint,
      timestamp: Date.now(),
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
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
    authUrl.searchParams.set("login_hint", oauthSetup.handle);

    console.log(`🔗 Mobile OAuth URL generated for ${oauthSetup.handle}`);

    return new Response(
      JSON.stringify({
        authUrl: authUrl.toString(),
        handle: oauthSetup.handle,
        did: oauthSetup.did,
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

// Mobile OAuth callback handler - completes token exchange and redirects to mobile app
export function handleMobileOAuthCallback(
  request: Request,
): Response {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response(
      JSON.stringify({ error: "Missing authorization code or state" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Success - return authorization code to mobile app for client-side token exchange
  const redirectUrl = new URL("anchor-app://auth-callback");
  redirectUrl.searchParams.set("code", code);
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
            // Redirect to mobile app with authorization code
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

// Mobile token exchange endpoint - exchange authorization code for tokens
export async function handleMobileTokenExchange(
  request: Request,
): Promise<Response> {
  try {
    const { code, state } = await request.json();

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: "Authorization code and state are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Decode state data
    let stateData: OAuthStateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (parseError) {
      console.error("Failed to parse OAuth state:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid OAuth state" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { codeVerifier, handle, did, pdsEndpoint, tokenEndpoint } = stateData;

    // Generate DPoP key pair for this session
    const { privateKey, publicKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const privateKeyJWK = JSON.stringify(
      await exportJWK(privateKey),
    );
    const publicKeyJWK = JSON.stringify(await exportJWK(publicKey));

    // Exchange authorization code for tokens using reusable DPoP function
    const requestBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${OAUTH_CONFIG.BASE_URL}/oauth/mobile-callback`,
      client_id: OAUTH_CONFIG.CLIENT_ID,
      code_verifier: codeVerifier,
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
      return new Response(
        JSON.stringify({ error: "Token exchange failed" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const tokens = await tokenResponse.json();

    // Calculate token expiration
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

    console.log(`Mobile session stored successfully for DID: ${did}`);

    // Register user for PDS crawling
    try {
      const { registerUser } = await import("../database/user-tracking.ts");
      await registerUser(did, handle, pdsEndpoint);
      console.log(`📝 Registered mobile user ${handle} for PDS crawling`);
    } catch (registrationError) {
      console.error(
        `Failed to register user ${handle}:`,
        registrationError,
      );
    }

    // Get user profile for mobile response
    const profileFetcher = new BlueskyProfileFetcher();
    const profile = await profileFetcher.fetchProfile(did);

    // Create session ID for mobile app
    const sessionId = crypto.randomUUID();

    // Store session ID and profile info in database for API authentication
    await sqlite.execute({
      sql:
        `UPDATE oauth_sessions SET session_id = ?, display_name = ?, avatar_url = ? WHERE did = ?`,
      args: [
        sessionId,
        profile?.displayName || null,
        profile?.avatar || null,
        did,
      ],
    });

    // Return complete authentication data following OAuth 2.1 spec
    const authResponse = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in || 7200, // OAuth 2.1 standard: lifetime in seconds
      token_type: "Bearer",
      scope: "atproto transition:generic",
      // User info
      did,
      handle,
      pds_url: pdsEndpoint,
      session_id: sessionId,
      // Optional profile data
      ...(profile?.displayName && { display_name: profile.displayName }),
      ...(profile?.avatar && { avatar: profile.avatar }),
    };

    console.log(`🔄 Mobile token exchange successful for ${handle}`);

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
