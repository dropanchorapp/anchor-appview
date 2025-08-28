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

  // Direct mobile login endpoint - serves React component for handle entry
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

    // Serve React-based mobile login page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in to Anchor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #f2f2f7;
            min-height: 100vh;
        }
    </style>
</head>
<body>
    <div id="mobile-login-root"></div>
    <script type="module">
        import React from "https://esm.sh/react@18";
        import { createRoot } from "https://esm.sh/react-dom@18/client";
        
        // Mobile Login Component
        function MobileLogin({ redirectUri }) {
          const [handle, setHandle] = React.useState("");
          const [loading, setLoading] = React.useState(false);
          const [error, setError] = React.useState("");

          const handleSubmit = async (e) => {
            e.preventDefault();
            
            if (!handle.trim()) {
              setError("Please enter your Bluesky handle");
              return;
            }
            
            setLoading(true);
            setError("");
            
            try {
              const params = new URLSearchParams({
                handle: handle.trim(),
                redirect_uri: redirectUri
              });
              
              window.location.href = \`/mobile/login?\${params.toString()}\`;
            } catch (err) {
              setError("Failed to connect. Please try again.");
              setLoading(false);
            }
          };

          return React.createElement("div", {
            style: {
              minHeight: "100vh",
              background: "#f2f2f7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
            }
          }, React.createElement("div", {
            style: {
              background: "white",
              borderRadius: "16px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              padding: "40px",
              width: "100%",
              maxWidth: "400px",
            }
          }, [
            // Header
            React.createElement("div", {
              key: "header",
              style: { textAlign: "center", marginBottom: "32px" }
            }, [
              React.createElement("img", {
                key: "logo",
                src: "https://res.cloudinary.com/dru3aznlk/image/upload/v1754747200/anchor-logo-transparent_nrw70y.png",
                alt: "Anchor",
                style: { height: "64px", width: "auto", marginBottom: "16px" }
              }),
              React.createElement("h1", {
                key: "title",
                style: {
                  fontSize: "24px",
                  fontWeight: "600",
                  color: "#1c1c1e",
                  marginBottom: "8px",
                  margin: "0 0 8px 0",
                }
              }, "Sign in to Anchor"),
              React.createElement("p", {
                key: "subtitle",
                style: {
                  color: "#8e8e93",
                  fontSize: "16px",
                  margin: "0 0 32px 0",
                  lineHeight: "1.4",
                }
              }, "Enter your Bluesky handle to continue")
            ]),
            
            // Form
            React.createElement("form", {
              key: "form",
              onSubmit: handleSubmit
            }, [
              React.createElement("div", {
                key: "form-group",
                style: { marginBottom: "24px" }
              }, [
                React.createElement("label", {
                  key: "label",
                  htmlFor: "handle",
                  style: {
                    display: "block",
                    fontWeight: "500",
                    color: "#1c1c1e",
                    marginBottom: "8px",
                    fontSize: "15px",
                  }
                }, "Bluesky Handle"),
                React.createElement("input", {
                  key: "input",
                  type: "text",
                  id: "handle",
                  value: handle,
                  onChange: (e) => setHandle(e.target.value),
                  placeholder: "username.bsky.social or your.domain",
                  autoComplete: "username",
                  autoCapitalize: "none",
                  autoCorrect: "off",
                  disabled: loading,
                  style: {
                    width: "100%",
                    padding: "12px 16px",
                    border: "1px solid #e5e5ea",
                    borderRadius: "12px",
                    fontSize: "16px",
                    background: loading ? "#f8f9fa" : "white",
                    color: "#1c1c1e",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                  }
                })
              ]),
              
              React.createElement("button", {
                key: "submit",
                type: "submit",
                disabled: loading || !handle.trim(),
                style: {
                  width: "100%",
                  padding: "14px",
                  background: loading || !handle.trim() ? "#c7c7cc" : "#007aff",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: loading || !handle.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }
              }, [
                loading && React.createElement("div", {
                  key: "spinner",
                  style: {
                    width: "16px",
                    height: "16px",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }
                }),
                loading ? "Connecting..." : "Continue with Bluesky"
              ]),
              
              error && React.createElement("div", {
                key: "error",
                style: {
                  color: "#ff3b30",
                  fontSize: "14px",
                  marginTop: "12px",
                  textAlign: "center",
                  padding: "8px",
                  background: "rgba(255, 59, 48, 0.1)",
                  borderRadius: "8px",
                }
              }, error)
            ]),
            
            // Security note
            React.createElement("div", {
              key: "security",
              style: {
                marginTop: "24px",
                padding: "16px",
                background: "rgba(52, 199, 89, 0.1)",
                borderRadius: "12px",
                textAlign: "center",
              }
            }, [
              React.createElement("div", {
                key: "security-header",
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  marginBottom: "8px",
                }
              }, [
                React.createElement("span", {
                  key: "lock",
                  style: { color: "#34c759", fontSize: "16px" }
                }, "🔒"),
                React.createElement("span", {
                  key: "title",
                  style: {
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#1c1c1e",
                  }
                }, "Secure Authentication")
              ]),
              React.createElement("p", {
                key: "description",
                style: {
                  fontSize: "13px",
                  color: "#8e8e93",
                  margin: "0",
                  lineHeight: "1.4",
                }
              }, "Your password will be entered securely on Bluesky's servers. Anchor never sees your password.")
            ])
          ]), 
          
          // CSS animation
          React.createElement("style", {
            key: "styles"
          }, \`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          \`));
        }
        
        // Render the component
        const root = createRoot(document.getElementById('mobile-login-root'));
        root.render(React.createElement(MobileLogin, { redirectUri: '${redirectUri}' }));
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
