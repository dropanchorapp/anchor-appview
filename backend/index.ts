import { Hono } from "https://esm.sh/hono";
import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";
import { initializeTables } from "./database/db.ts";
import {
  deleteOAuthSession,
  getDashboardStats,
  getRecentCheckins,
  getSessionBySessionId as _getSessionBySessionId,
} from "./database/queries.ts";
import {
  handleClientMetadata,
  handleOAuthCallback,
  handleOAuthStart,
} from "./oauth/endpoints.ts";

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

// AppView API endpoints (original Anchor functionality)
import anchorApiHandler from "./api/anchor-api.ts";

app.get("/global", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/nearby", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/user", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/following", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

app.get("/stats", async (c) => {
  const response = await anchorApiHandler(c.req.raw);
  return response;
});

// Frontend API endpoints (for React app)
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

app.post("/api/auth/logout", async (c) => {
  try {
    const { did } = await c.req.json();

    if (!did) {
      return c.json({ error: "DID is required" }, 400);
    }

    await deleteOAuthSession(did);
    return c.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Logout failed" }, 500);
  }
});

// Serve main app for all other routes
app.get("*", (_c) => serveFile("/frontend/index.html", import.meta.url));

// Error handler
app.onError((err, _c) => {
  console.error("Server error:", err);
  throw err; // Re-throw for full stack traces
});

export default app;
