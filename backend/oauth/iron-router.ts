// Iron Session-based OAuth routes for Hono on Val.town
// Based on BookHive's auth/router.tsx but adapted for Val.town environment

import { Hono } from "https://esm.sh/hono";
import { getIronSession, sealData, unsealData } from "npm:iron-session@8.0.4";
import { isValidHandle } from "npm:@atproto/syntax@0.4.0";
import { CustomOAuthClient } from "./custom-oauth-client.ts";
import { valTownStorage } from "./iron-storage.ts";

const COOKIE_SECRET = Deno.env.get("COOKIE_SECRET") ||
  "anchor-default-secret-for-development-only";
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

export interface Session {
  did: string;
}

// Helper functions for PKCE (same as CustomOAuthClient)
function _generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
    .replace(/=/g, "");
}

async function _generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
    .replace(/=/g, "");
}

export function createOAuthRouter() {
  const app = new Hono<{ Variables: { oauthClient: CustomOAuthClient } }>();
  let oauthClient: CustomOAuthClient | null = null;

  // Initialize OAuth client
  app.use("*", async (c, next) => {
    if (!oauthClient) {
      oauthClient = new CustomOAuthClient(valTownStorage);
    }
    c.set("oauthClient", oauthClient);
    await next();
  });

  // Client metadata endpoint
  app.get("/client-metadata.json", (c) => {
    return c.json({
      client_name: "Anchor Location Feed",
      client_id: `${BASE_URL}/client-metadata.json`,
      client_uri: BASE_URL,
      redirect_uris: [`${BASE_URL}/oauth/callback`],
      scope: "atproto transition:generic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "none",
      dpop_bound_access_tokens: true, // Required by AT Protocol - we handle DPoP manually
      logo_uri: `${BASE_URL}/static/anchor-logo-transparent.png`,
      policy_uri: `${BASE_URL}/privacy-policy`,
    });
  });

  // Start OAuth flow (web and mobile)
  app.get("/login", async (c) => {
    const { handle } = c.req.query();

    if (typeof handle !== "string" || !isValidHandle(handle)) {
      return c.text("Invalid handle", 400);
    }

    try {
      // Use custom OAuth client (official library has crypto issues in Deno)
      console.log(`Starting OAuth authorize for handle: ${handle}`);
      const state = crypto.randomUUID();
      const url = await c.get("oauthClient").getAuthorizationUrl(handle, state);
      console.log(`Generated authorization URL: ${url}`);
      return c.redirect(url);
    } catch (err) {
      console.error("OAuth authorize failed:", err);
      return c.text(
        err instanceof Error ? err.message : "Couldn't initiate login",
        400,
      );
    }
  });

  // OAuth callback to complete session creation
  app.get("/oauth/callback", async (c) => {
    try {
      // Use custom OAuth client callback
      console.log(`Processing OAuth callback`);
      const params = new URLSearchParams(c.req.url.split("?")[1]);
      const oauthSession = await c.get("oauthClient").handleCallback(params);

      console.log(`OAuth callback successful for DID: ${oauthSession.did}`);

      const clientSession = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
        // Set session TTL to 24 hours, independent of token expiration
        ttl: 60 * 60 * 24,
      });

      clientSession.did = oauthSession.did;
      await clientSession.save();

      // Store OAuth session in our storage for later use
      await valTownStorage.set(
        `oauth_session:${oauthSession.did}`,
        oauthSession,
      );

      // Check if this is a mobile callback by parsing the state
      let state;
      try {
        const stateParam = params.get("state");
        state = stateParam ? JSON.parse(stateParam) : null;
      } catch {
        state = null;
      }

      // Handle mobile callback
      if (
        state && state.redirectUri &&
        state.redirectUri.startsWith("anchor-app:")
      ) {
        console.log("Mobile OAuth callback detected");

        // Create sealed session token for mobile
        const sealedToken = await sealData({ did: oauthSession.did }, {
          password: COOKIE_SECRET,
        });

        // Redirect to mobile app with sealed token
        const mobileRedirectUrl = new URL(state.redirectUri);
        mobileRedirectUrl.searchParams.set("session_token", sealedToken);
        mobileRedirectUrl.searchParams.set("did", oauthSession.did);

        console.log(
          `Redirecting mobile app to: ${mobileRedirectUrl.toString()}`,
        );
        return c.redirect(mobileRedirectUrl.toString());
      }

      // Web callback - set cookies and redirect to home
      return c.redirect("/");
    } catch (err) {
      console.error("OAuth callback failed:", err);
      return c.text(`Login failed: ${(err as Error).message}`, 400);
    }
  });

  // Direct mobile login endpoint - serves HTML form for handle entry
  app.get("/mobile/login-direct", (c) => {
    const { redirect_uri: redirectUri } = c.req.query();

    if (typeof redirectUri !== "string") {
      return c.text("redirect_uri is required for mobile login", 400);
    }

    try {
      // Validate redirect URI
      const redirectUrl = new URL(redirectUri);
      if (redirectUrl.protocol !== "anchor-app:") {
        return c.text("Invalid redirect_uri - must use anchor-app scheme", 400);
      }
    } catch {
      return c.text("Invalid redirect_uri format", 400);
    }

    // Serve mobile login form
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in to Anchor</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 40px;
            width: 100%;
            max-width: 400px;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 32px;
        }
        
        .logo-icon {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 16px;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 28px;
        }
        
        h1 {
            font-size: 24px;
            font-weight: 600;
            color: #1a202c;
            margin-bottom: 8px;
        }
        
        .subtitle {
            color: #718096;
            font-size: 16px;
            margin-bottom: 32px;
        }
        
        .form-group {
            margin-bottom: 24px;
        }
        
        label {
            display: block;
            font-weight: 500;
            color: #2d3748;
            margin-bottom: 8px;
        }
        
        input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.2s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        
        .btn:hover {
            transform: translateY(-1px);
        }
        
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .security-note {
            margin-top: 24px;
            padding: 16px;
            background: #f7fafc;
            border-radius: 8px;
            font-size: 14px;
            color: #4a5568;
            text-align: center;
        }
        
        .security-icon {
            color: #48bb78;
            margin-right: 4px;
        }
        
        .error {
            color: #e53e3e;
            font-size: 14px;
            margin-top: 8px;
            text-align: center;
        }
        
        @media (max-width: 480px) {
            .container {
                padding: 32px 24px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <div class="logo-icon">⚓</div>
            <h1>Sign in to Anchor</h1>
            <p class="subtitle">Enter your Bluesky handle to continue</p>
        </div>
        
        <form id="loginForm">
            <div class="form-group">
                <label for="handle">Bluesky Handle</label>
                <input 
                    type="text" 
                    id="handle" 
                    name="handle" 
                    placeholder="username.bsky.social or your.domain"
                    required
                    autocomplete="username"
                    autocapitalize="none"
                    autocorrect="off"
                />
            </div>
            
            <button type="submit" class="btn" id="submitBtn">
                Continue with Bluesky
            </button>
            
            <div id="error" class="error" style="display: none;"></div>
        </form>
        
        <div class="security-note">
            <span class="security-icon">🔒</span>
            Your password will be entered securely on Bluesky's servers. Anchor never sees your password.
        </div>
    </div>
    
    <script>
        const form = document.getElementById('loginForm');
        const handleInput = document.getElementById('handle');
        const submitBtn = document.getElementById('submitBtn');
        const errorDiv = document.getElementById('error');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const handle = handleInput.value.trim();
            if (!handle) {
                showError('Please enter your Bluesky handle');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connecting...';
            errorDiv.style.display = 'none';
            
            try {
                // Start OAuth flow with the entered handle
                const response = await fetch('/mobile/login', {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/plain'
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to start OAuth flow');
                }
                
                // Redirect to OAuth flow
                const params = new URLSearchParams({
                    handle: handle,
                    redirect_uri: '${redirectUri}'
                });
                
                window.location.href = '/mobile/login?' + params.toString();
                
            } catch (error) {
                showError('Failed to connect. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Continue with Bluesky';
            }
        });
        
        function showError(message) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
        
        // Focus the handle input on load
        handleInput.focus();
    </script>
</body>
</html>`;

    return c.html(html);
  });

  // Mobile login endpoint
  app.get("/mobile/login", async (c) => {
    const { handle, redirect_uri: redirectUri } = c.req.query();

    if (typeof handle !== "string" || !isValidHandle(handle)) {
      return c.text("Invalid handle", 400);
    }

    if (typeof redirectUri !== "string") {
      return c.text("redirect_uri is required for mobile login", 400);
    }

    try {
      // Validate redirect URI
      const redirectUrl = new URL(redirectUri);
      if (redirectUrl.protocol !== "anchor-app:") {
        return c.text("Invalid redirect_uri - must use anchor-app scheme", 400);
      }
    } catch {
      return c.text("Invalid redirect_uri format", 400);
    }

    try {
      // Use custom OAuth client with mobile redirect
      console.log(`Starting mobile OAuth authorize for handle: ${handle}`);
      const state = JSON.stringify({ redirectUri, handle });
      const url = await c.get("oauthClient").getAuthorizationUrl(handle, state);
      console.log(`Generated mobile authorization URL: ${url}`);
      return c.redirect(url);
    } catch (err) {
      console.error("OAuth authorize failed:", err);
      return c.text(
        err instanceof Error ? err.message : "Couldn't initiate login",
        400,
      );
    }
  });

  // Mobile token refresh endpoint
  app.get("/mobile/refresh-token", async (c) => {
    try {
      // Get session token from Authorization header
      const authHeader = c.req.header("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ success: false, error: "Missing Bearer token" }, 401);
      }

      const sealedToken = authHeader.slice(7); // Remove "Bearer " prefix

      // Unseal the token to get session data
      const sessionData = await unsealData(sealedToken, {
        password: COOKIE_SECRET,
      }) as { did: string };

      if (!sessionData.did) {
        return c.json({ success: false, error: "Invalid session token" }, 401);
      }

      // Check if OAuth session still exists
      const oauthSession = await valTownStorage.get(
        `oauth_session:${sessionData.did}`,
      );
      if (!oauthSession) {
        return c.json(
          { success: false, error: "OAuth session not found" },
          401,
        );
      }

      // TODO: Implement actual token refresh logic
      // For now, just return a new sealed token with extended TTL
      const newSealedToken = await sealData({ did: sessionData.did }, {
        password: COOKIE_SECRET,
      });

      return c.json({
        success: true,
        payload: {
          session_token: newSealedToken,
          did: sessionData.did,
        },
      });
    } catch (err) {
      console.error("Token refresh failed:", err);
      return c.json({ success: false, error: "Token refresh failed" }, 500);
    }
  });

  // Logout handler
  app.post("/api/auth/logout", async (c) => {
    try {
      const session = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
      });

      console.log("Logout: session DID:", session.did);

      if (session.did) {
        // Clean up server-side OAuth session data
        try {
          await valTownStorage.del(`oauth_session:${session.did}`);
          console.log("Logout: Cleaned up OAuth session data");
        } catch (err) {
          console.error("Error cleaning up OAuth session:", err);
        }
      }

      // Destroy the Iron Session (clears the cookie)
      await session.destroy();
      console.log("Logout: Session destroyed");

      return c.json({ success: true });
    } catch (err) {
      console.error("Logout failed:", err);
      return c.json({ success: false, error: "Logout failed" }, 500);
    }
  });

  // Session validation endpoint (for API authentication)
  app.get("/validate-session", async (c) => {
    try {
      const session = await getIronSession<Session>(c.req.raw, c.res, {
        cookieName: "sid",
        password: COOKIE_SECRET,
      });

      if (!session.did) {
        return c.json({ valid: false }, 401);
      }

      // Check if we have OAuth session data
      const oauthSession = await valTownStorage.get(
        `oauth_session:${session.did}`,
      );
      if (!oauthSession) {
        return c.json({ valid: false }, 401);
      }

      return c.json({
        valid: true,
        did: session.did,
        handle: oauthSession.handle,
      });
    } catch (err) {
      console.error("Session validation failed:", err);
      return c.json({ valid: false }, 401);
    }
  });

  return app;
}
