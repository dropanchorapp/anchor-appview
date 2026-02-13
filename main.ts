// Main entry point for Anchor AppView - Fresh 2 application

// Load environment variables from .env file (local development)
import { load } from "@std/dotenv";
try {
  await load({ export: true });
} catch { /* .env file not required */ }

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

// Error handling middleware
app = app.use(async (ctx) => {
  try {
    return await ctx.next();
  } catch (err) {
    console.error("Unhandled error:", err);
    throw err;
  }
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

// Serve static files from /static directory
app.use(staticFiles());

// ============================================================================
// Register routes
// ============================================================================

// Auth routes (OAuth, session, mobile auth)
app = registerAuthRoutes(app);

// API routes — anchor-api handler takes raw Request
app = app.get("/api/nearby", (ctx) => anchorApiHandler(ctx.req));

// REST-style checkin endpoints
app = app.get("/api/checkins/:did", (ctx) => anchorApiHandler(ctx.req));
app = app.get("/api/checkins/:did/:rkey", (ctx) => anchorApiHandler(ctx.req));

// Checkin CRUD
app = app.post("/api/checkins", (ctx) => createCheckin(ctx.req));
app = app.delete("/api/checkins/:did/:rkey", (ctx) => {
  const url = new URL(ctx.req.url);
  const parts = url.pathname.split("/");
  // /api/checkins/:did/:rkey → parts[3] = did, parts[4] = rkey
  const did = parts[3];
  const rkey = parts[4];
  return deleteCheckin(ctx.req, did, rkey);
});

// Likes and comments endpoints — handled by anchor-api
app = app.get(
  "/api/checkins/:did/:rkey/likes",
  (ctx) => anchorApiHandler(ctx.req),
);
app = app.post(
  "/api/checkins/:did/:rkey/likes",
  (ctx) => anchorApiHandler(ctx.req),
);
app = app.delete(
  "/api/checkins/:did/:rkey/likes",
  (ctx) => anchorApiHandler(ctx.req),
);
app = app.get(
  "/api/checkins/:did/:rkey/comments",
  (ctx) => anchorApiHandler(ctx.req),
);
app = app.post(
  "/api/checkins/:did/:rkey/comments",
  (ctx) => anchorApiHandler(ctx.req),
);
app = app.delete(
  "/api/checkins/:did/:rkey/comments",
  (ctx) => anchorApiHandler(ctx.req),
);

// Checkin migration endpoint
app = app.post(
  "/api/migrate-checkins",
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

// Frontend routes LAST (contains catch-all route)
app = registerFrontendRoutes(app, import.meta.url);

// Export app for Fresh build system
export { app };
