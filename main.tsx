// @val-town anchordashboard
// Main HTTP entry point for Anchor AppView
import { Hono } from "https://esm.sh/hono";
import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";
import { initializeTables } from "./backend/database/db.ts";
import {
  deleteOAuthSession,
  getDashboardStats,
  getRecentCheckins,
  getSessionBySessionId as _getSessionBySessionId,
} from "./backend/database/queries.ts";
import {
  handleClientMetadata,
  handleOAuthCallback,
  handleOAuthStart,
} from "./backend/oauth/endpoints.ts";
import anchorApiHandler from "./backend/api/anchor-api.ts";

const app = new Hono();

// Initialize database on startup
await initializeTables();

// Serve static frontend files
app.get("/frontend/*", (c) => serveFile(c.req.path, import.meta.url));
app.get("/shared/*", (c) => serveFile(c.req.path, import.meta.url));

// OAuth endpoints
app.get("/client-metadata.json", async (_c) => {
  const response = await handleClientMetadata();
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

app.post("/api/auth/start", async (c) => {
  const response = await handleOAuthStart(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

app.get("/oauth/callback", async (c) => {
  const response = await handleOAuthCallback(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });
});

// ========================================
// JSON API Routes (under /api/ namespace)
// ========================================
app.get("/api/global", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/nearby", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/user", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/following", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/stats", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/api/places/nearby", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

// ========================================
// Dashboard API Routes (for React frontend)
// ========================================
app.get("/api/feed", async (c) => {
  try {
    const checkins = await getRecentCheckins(50);
    return c.json({
      checkins,
      cursor: checkins.length > 0
        ? checkins[checkins.length - 1].id
        : undefined,
    });
  } catch (error) {
    console.error("Feed error:", error);
    return c.json({ error: "Failed to load feed" }, 500);
  }
});

app.get("/api/admin/stats", async (c) => {
  try {
    const stats = await getDashboardStats();
    return c.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    return c.json({ error: "Failed to load stats" }, 500);
  }
});

app.post("/api/admin/backfill", async (c) => {
  try {
    // Import and run the backfill function
    const backfillModule = await import(
      "./scripts/backfill-historical-checkins.ts"
    );
    const response = await backfillModule.default();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, response.status);
    }
  } catch (error) {
    console.error("Backfill error:", error);
    return c.json({ error: "Backfill failed", details: error.message }, 500);
  }
});

app.post("/api/admin/discover-checkins", async (c) => {
  try {
    // Import and run the comprehensive discovery
    const discoveryModule = await import(
      "./scripts/comprehensive-checkin-discovery.ts"
    );
    const response = await discoveryModule.default();

    if (response.status === 200) {
      const result = await response.text();
      return c.text(result);
    } else {
      const error = await response.text();
      return c.text(error, response.status);
    }
  } catch (error) {
    console.error("Discovery error:", error);
    return c.json({
      error: "Discovery failed",
      details: error.message,
    }, 500);
  }
});

app.post("/api/admin/backfill-profiles", async (c) => {
  try {
    console.log("Starting profile backfill...");

    // Get all unique DIDs from checkins
    const { getAllCheckinDids } = await import("./backend/database/queries.ts");
    const dids = await getAllCheckinDids();

    if (dids.length === 0) {
      return c.json({ message: "No DIDs found to process", dids_processed: 0 });
    }

    // Initialize storage
    const { SqliteStorageProvider } = await import(
      "./backend/utils/storage-provider.ts"
    );
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

    const storage = new SqliteStorageProvider(sqlite);

    // Force resolve all profiles using direct fetching
    const { BlueskyProfileFetcher } = await import(
      "./backend/utils/profile-resolver.ts"
    );
    const fetcher = new BlueskyProfileFetcher();

    const resolvedProfiles = new Map();

    console.log(`Found DIDs to process: ${JSON.stringify(dids)}`);

    for (const did of dids) {
      try {
        console.log(`Resolving profile for DID: ${did}`);

        // Direct fetch to bypass any caching issues
        const profile = await fetcher.fetchProfile(did);
        console.log(`Profile fetched for ${did}:`, !!profile);

        if (profile) {
          // Store in cache
          await storage.setProfile(profile);
          resolvedProfiles.set(did, profile);
          console.log(`Stored profile for ${did}: ${profile.handle}`);
        } else {
          console.log(`No profile data returned for ${did}`);
        }
      } catch (error) {
        console.error(`Failed to resolve profile for ${did}:`, error);
      }
    }

    console.log(
      `Profile backfill completed: ${resolvedProfiles.size}/${dids.length} profiles resolved`,
    );

    return c.json({
      success: true,
      dids_found: dids.length,
      profiles_resolved: resolvedProfiles.size,
      resolved_profiles: Array.from(resolvedProfiles.entries()).map((
        [did, profile],
      ) => ({
        did,
        handle: profile.handle,
        displayName: profile.displayName,
        avatar: profile.avatar ? "✅" : "❌",
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Profile backfill error:", error);
    return c.json({
      success: false,
      error: "Profile backfill failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/admin/test-profile", async (c) => {
  try {
    // Test direct profile fetching
    const { BlueskyProfileFetcher } = await import(
      "./backend/utils/profile-resolver.ts"
    );
    const fetcher = new BlueskyProfileFetcher();

    const testDid = "did:plc:wxex3wx5k4ctciupsv5m5stb";
    console.log(`Testing profile fetch for ${testDid}`);

    const profile = await fetcher.fetchProfile(testDid);

    return c.json({
      success: true,
      test_did: testDid,
      profile_fetched: !!profile,
      profile_data: profile,
    });
  } catch (error) {
    console.error("Profile test error:", error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

app.post("/api/admin/resolve-addresses", async (c) => {
  try {
    console.log("Starting address resolution...");

    // Import the address resolution functions
    const { getUnresolvedAddresses, batchResolveAddresses } = await import(
      "./backend/utils/address-resolver.ts"
    );

    // Get unresolved addresses (limit to 20 to avoid overwhelming)
    const unresolvedAddresses = await getUnresolvedAddresses(20);

    if (unresolvedAddresses.length === 0) {
      return c.json({
        success: true,
        message: "No unresolved addresses found",
        resolved: 0,
        errors: 0,
      });
    }

    console.log(`Found ${unresolvedAddresses.length} unresolved addresses`);

    // Resolve them in batches
    const result = await batchResolveAddresses(unresolvedAddresses);

    console.log(
      `Address resolution complete: ${result.resolved} resolved, ${result.errors} errors`,
    );

    return c.json({
      success: true,
      message: "Address resolution completed",
      unresolved_found: unresolvedAddresses.length,
      resolved: result.resolved,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Address resolution error:", error);
    return c.json({
      success: false,
      error: "Address resolution failed",
      details: error.message,
    }, 500);
  }
});

app.get("/api/auth/session", async (c) => {
  try {
    const sessionCookie = c.req.header("cookie");
    const anchorSession = sessionCookie
      ?.split(";")
      .find((cookie) => cookie.trim().startsWith("anchor_session="))
      ?.split("=")[1];

    if (!anchorSession) {
      return c.json({ authenticated: false });
    }

    const session = await _getSessionBySessionId(anchorSession);
    if (!session) {
      return c.json({ authenticated: false });
    }

    // Return user info without sensitive tokens
    return c.json({
      authenticated: true,
      userHandle: session.handle,
      userDid: session.did,
      userDisplayName: session.display_name,
      userAvatar: session.avatar_url,
    });
  } catch (error) {
    console.error("Session check error:", error);
    return c.json({ authenticated: false });
  }
});

app.post("/api/auth/logout", async (c) => {
  try {
    const { did } = await c.req.json();

    if (!did) {
      return c.json({ error: "DID is required" }, 400);
    }

    await deleteOAuthSession(did);

    // Clear the session cookie
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "anchor_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/",
      },
    });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Logout failed" }, 500);
  }
});

// ========================================
// Mobile OAuth Routes
// ========================================

// Mobile authentication page for WebView integration
app.get("/mobile-auth", (c) => {
  return c.html(`<!DOCTYPE html>
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
            line-height: 1.5;
            color: #1c1c1e;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px 30px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
        }

        .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
        }

        h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #1c1c1e;
        }

        .subtitle {
            color: #8e8e93;
            margin-bottom: 32px;
            font-size: 16px;
        }

        .form {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .input-group {
            text-align: left;
        }

        label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #1c1c1e;
        }

        input {
            width: 100%;
            padding: 16px;
            border: 2px solid #f2f2f7;
            border-radius: 12px;
            font-size: 16px;
            background: #f9f9f9;
            transition: all 0.2s ease;
        }

        input:focus {
            outline: none;
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        }

        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
        }

        .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .spinner {
            display: none;
            width: 20px;
            height: 20px;
            border: 2px solid transparent;
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }

        .btn.loading .btn-text { display: none; }
        .btn.loading .spinner { display: block; }

        .error {
            background: #ff3b30;
            color: white;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
        }

        .footer {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #f2f2f7;
            color: #8e8e93;
            font-size: 14px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">⚓</div>
        <h1>Sign in to Anchor</h1>
        <p class="subtitle">Connect with your Bluesky account</p>
        
        <div class="error" id="error"></div>
        
        <form class="form" id="auth-form">
            <div class="input-group">
                <label for="handle">Bluesky Handle</label>
                <input 
                    type="text" 
                    id="handle" 
                    name="handle" 
                    placeholder="yourhandle.bsky.social"
                    autocomplete="username"
                    required
                >
            </div>
            
            <button type="submit" class="btn" id="submit-btn">
                <span class="btn-text">Sign in with Bluesky</span>
                <div class="spinner"></div>
            </button>
        </form>
        
        <div class="footer">
            Powered by AT Protocol
        </div>
    </div>

    <script>
        const form = document.getElementById('auth-form');
        const submitBtn = document.getElementById('submit-btn');
        const errorDiv = document.getElementById('error');
        const handleInput = document.getElementById('handle');

        function showError(message) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        function hideError() {
            errorDiv.style.display = 'none';
        }

        function setLoading(loading) {
            if (loading) {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
            } else {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        }

        // Auto-format handle input
        handleInput.addEventListener('input', (e) => {
            let value = e.target.value.trim();
            if (value && !value.includes('.') && !value.includes('@')) {
                value = value + '.bsky.social';
                e.target.value = value;
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const handle = handleInput.value.trim();
            if (!handle) {
                showError('Please enter your Bluesky handle');
                return;
            }

            hideError();
            setLoading(true);

            try {
                const response = await fetch('/api/auth/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ handle })
                });

                if (!response.ok) {
                    throw new Error('Failed to start authentication');
                }

                const data = await response.json();
                
                if (data.authUrl) {
                    // Redirect to OAuth authorization
                    window.location.href = data.authUrl;
                } else {
                    throw new Error('No authorization URL received');
                }
            } catch (error) {
                console.error('Login failed:', error);
                showError('Login failed. Please check your handle and try again.');
                setLoading(false);
            }
        });

        // Focus on handle input when page loads
        window.addEventListener('load', () => {
            handleInput.focus();
        });
    </script>
</body>
</html>`);
});

// Mobile token validation endpoint
app.post("/api/auth/validate-mobile-session", async (c) => {
  try {
    const { access_token, refresh_token, did, handle, session_id } = await c.req
      .json();

    if (!access_token || !refresh_token || !did || !handle) {
      return c.json(
        { valid: false, error: "Missing required parameters" },
        400,
      );
    }

    // Validate that the tokens are properly formatted JWTs
    const isValidJWT = (token: string) => {
      try {
        const parts = token.split(".");
        return parts.length === 3 && parts.every((part) => part.length > 0);
      } catch {
        return false;
      }
    };

    if (!isValidJWT(access_token) || !isValidJWT(refresh_token)) {
      return c.json({ valid: false, error: "Invalid token format" }, 400);
    }

    return c.json({
      valid: true,
      user: {
        did,
        handle,
        sessionId: session_id,
      },
    });
  } catch (error) {
    console.error("Mobile session validation error:", error);
    return c.json({ valid: false, error: "Validation failed" }, 500);
  }
});

// ========================================
// Frontend Routes (HTML/React views)
// ========================================

// Serve main app for all other routes
app.get("*", (_c) => serveFile("/frontend/index.html", import.meta.url));

// Error handler
app.onError((err, _c) => {
  console.error("Server error:", err);
  throw err; // Re-throw for full stack traces
});

// Export the Hono app's fetch handler for Val Town
export default app.fetch;
