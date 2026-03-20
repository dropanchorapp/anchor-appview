// Main entry point for Anchor AppView - Fresh 2 application

// Load environment variables from .env file (local development)
import { load } from "@std/dotenv";
try {
  await load({ export: true });
} catch { /* .env file not required */ }

// Initialize Sentry error tracking (before other imports)
import * as Sentry from "@sentry/deno";
Sentry.init({
  dsn:
    "https://0794447a4665743cb632450a266948de@o4510481285185536.ingest.de.sentry.io/4510879854755920",
  tracesSampleRate: 0.2,
  environment: Deno.env.get("DENO_DEPLOYMENT_ID")
    ? "production"
    : "development",
  beforeSend(event) {
    // Drop URIError from malformed URLs (e.g. /%c0). These are caused by bots
    // and scanners sending invalid percent-encoding. Fresh's router calls
    // decodeURI() during route matching before middleware can intercept.
    // See: Sentry #102617952.
    const exception = event.exception?.values?.[0];
    if (exception?.type === "URIError") {
      return null;
    }
    return event;
  },
});

import { App, staticFiles } from "@fresh/core";
import { initializeTables } from "./backend/database/db.ts";
import { initOAuth } from "./backend/routes/oauth.ts";
import { registerAuthRoutes } from "./backend/routes/auth.ts";
import { registerFrontendRoutes } from "./backend/routes/frontend.ts";
import anchorApiHandler from "./backend/api/anchor-api.ts";
import { createCheckin, deleteCheckin } from "./backend/api/checkins.ts";

// Initialize database on startup
await initializeTables();

// Create the Fresh app
let app = new App();

// ============================================================================
// Middleware
// ============================================================================

// Error handling middleware — report to Sentry
app = app.use(async (ctx) => {
  try {
    return await ctx.next();
  } catch (err) {
    Sentry.captureException(err);
    console.error("Unhandled error:", err);
    throw err;
  }
});

// Trailing slash normalization — redirect /path/ to /path (308 preserves method+body).
// Fresh's static route lookup uses exact pathname matching, so "/api/checkins/"
// misses the registered "/api/checkins" route and falls through to the catch-all
// GET * handler, which returns 405 for POST requests.
app = app.use(async (ctx) => {
  const url = new URL(ctx.req.url);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return Response.redirect(url.toString(), 308);
  }
  return await ctx.next();
});

// Initialize OAuth on first request (derives BASE_URL from request if not set)
app = app.use(async (ctx) => {
  initOAuth(ctx.req);
  return await ctx.next();
});

// Security headers middleware
app = app.use(async (ctx) => {
  const response = await ctx.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  return response;
});

// ============================================================================
// Register routes
// ============================================================================

// Auth routes (OAuth, session, mobile auth)
app = registerAuthRoutes(app);

// API write operations (POST/DELETE) — registered as middleware so they always
// execute regardless of Fresh's URLPattern router method matching. This prevents
// 405 errors when the catch-all GET * in frontend routes matches the path but
// not the method. See: Sentry #96584021.
app = app.use(async (ctx) => {
  const url = new URL(ctx.req.url);
  const method = ctx.req.method;

  if (
    !url.pathname.startsWith("/api/") ||
    (method !== "POST" && method !== "DELETE")
  ) {
    return await ctx.next();
  }

  // POST /api/checkins
  if (method === "POST" && url.pathname === "/api/checkins") {
    return createCheckin(ctx.req);
  }

  // DELETE /api/checkins/:did/:rkey
  if (method === "DELETE") {
    const deleteParts = url.pathname.split("/");
    if (
      deleteParts.length === 5 && deleteParts[1] === "api" &&
      deleteParts[2] === "checkins"
    ) {
      return deleteCheckin(ctx.req, deleteParts[3], deleteParts[4]);
    }
  }

  // POST/DELETE for likes, comments, migrate — handled by anchor-api
  if (
    url.pathname.startsWith("/api/checkins/") ||
    url.pathname === "/api/migrate-checkins"
  ) {
    return anchorApiHandler(ctx.req);
  }

  // Unhandled POST/DELETE to /api/* — return 404 instead of falling through
  // to the catch-all GET * route which would return 405
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
});

// API read routes (GET) — method-specific routing works fine with catch-all GET *
app = app.get("/api/nearby", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/checkins/:did", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/checkins/:did/:rkey", (ctx) => anchorApiHandler(ctx.req));
app = app.get(
  "/api/checkins/:did/:rkey/likes",
  (ctx) => anchorApiHandler(ctx.req),
);
app = app.get(
  "/api/checkins/:did/:rkey/comments",
  (ctx) => anchorApiHandler(ctx.req),
);

// Legacy /api/user endpoints for backward compatibility
app = app.get("/api/user/:identifier", (ctx) => {
  const url = new URL(ctx.req.url);
  url.pathname = `/api/checkins/${url.pathname.split("/")[3]}`;
  return Response.redirect(url.toString(), 301);
});

app = app.get("/api/user", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/following", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/stats", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/places/nearby", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/places/search", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/places/categories", (ctx) => anchorApiHandler(ctx.req));

// Legacy /api/checkin/* endpoint for backward compatibility
app = app.get("/api/checkin/:path*", (ctx) => anchorApiHandler(ctx.req));

// Serve static files
app = app.use(staticFiles());

// Frontend routes LAST (contains catch-all route)
app = registerFrontendRoutes(app, import.meta.url);

// Export app for Fresh build system
export { app };
