// @val-town anchordashboard
// Main HTTP entry point for Anchor AppView - organized route groups
import { Hono } from "jsr:@hono/hono@4.9.6";
import { initializeTables } from "./backend/database/db.ts";
import { oauthRoutes } from "./backend/routes/oauth.ts";
import { createAdminRoutes } from "./backend/routes/admin.ts";
import { createCronRoutes } from "./backend/routes/cron.ts";
import { createFrontendRoutes } from "./backend/routes/frontend.ts";
import anchorApiHandler from "./backend/api/anchor-api.ts";

const app = new Hono();

// Initialize database on startup
await initializeTables();

// Mount API routes FIRST (before catch-all frontend routes)
app.get("/api/nearby", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/user", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/following", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/stats", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/places/nearby", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/places/search", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/places/categories", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

app.get("/api/checkin/*", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Check-in creation endpoint
app.post("/api/checkins", async (c) => {
  return await anchorApiHandler(c.req.raw);
});

// Mount other route groups
app.route("/", oauthRoutes);
app.route("/", createAdminRoutes());
app.route("/", createCronRoutes());

// Mount frontend routes LAST (contains catch-all route)
app.route("/", createFrontendRoutes());

export default app.fetch;
// Force Val Town cache refresh for oauth-client-deno@1.0.2 DPoP fix
