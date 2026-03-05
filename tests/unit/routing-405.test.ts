/**
 * Regression tests for 405 on POST/DELETE API endpoints.
 * Verifies that API write operations work correctly even with
 * a catch-all GET * route (used by the SPA frontend).
 *
 * See: Sentry #96584021
 */
import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { App, staticFiles } from "@fresh/core";

function createTestApp(): {
  app: App<any>;
  handler: ReturnType<App<any>["handler"]>;
} {
  let app = new App();

  // Middleware (mirrors main.ts order)
  app = app.use(async (ctx) => {
    const url = new URL(ctx.req.url);
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
      return Response.redirect(url.toString(), 308);
    }
    return await ctx.next();
  });

  // API write middleware (mirrors main.ts approach)
  app = app.use(async (ctx) => {
    const url = new URL(ctx.req.url);
    const method = ctx.req.method;

    if (
      !url.pathname.startsWith("/api/") ||
      (method !== "POST" && method !== "DELETE")
    ) {
      return await ctx.next();
    }

    if (method === "POST" && url.pathname === "/api/checkins") {
      return Response.json({ created: true }, { status: 201 });
    }

    if (method === "DELETE") {
      const parts = url.pathname.split("/");
      if (parts.length === 5 && parts[1] === "api" && parts[2] === "checkins") {
        return new Response(null, { status: 204 });
      }
    }

    if (url.pathname.startsWith("/api/checkins/")) {
      return Response.json({ handled: true });
    }

    return await ctx.next();
  });

  // GET routes
  app = app.get("/api/checkins/:did", () => Response.json({ checkins: [] }));
  app = app.get(
    "/api/checkins/:did/:rkey",
    () => Response.json({ checkin: {} }),
  );
  app = app.get(
    "/api/checkins/:did/:rkey/likes",
    () => Response.json({ likes: [] }),
  );

  // Static files
  app = app.use(staticFiles());

  // Catch-all GET (SPA fallback — same as registerFrontendRoutes)
  app = app.get("*", () => {
    return new Response("<html>SPA</html>", {
      headers: { "Content-Type": "text/html" },
    });
  });

  return { app, handler: app.handler() };
}

Deno.test("POST /api/checkins returns 201, not 405", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/api/checkins", {
      method: "POST",
      body: new FormData(),
    }),
  );
  assertEquals(res.status, 201);
});

Deno.test("DELETE /api/checkins/:did/:rkey returns 204, not 405", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/api/checkins/did:plc:test123/abc123", {
      method: "DELETE",
    }),
  );
  assertEquals(res.status, 204);
});

Deno.test("POST /api/checkins/:did/:rkey/likes returns 200, not 405", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/api/checkins/did:plc:test123/abc123/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  assertEquals(res.status, 200);
});

Deno.test("DELETE /api/checkins/:did/:rkey/likes returns 200, not 405", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/api/checkins/did:plc:test123/abc123/likes", {
      method: "DELETE",
    }),
  );
  assertEquals(res.status, 200);
});

Deno.test("GET /api/checkins/:did still works via route handler", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/api/checkins/did:plc:test123"),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.checkins, []);
});

Deno.test("GET / returns SPA HTML", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/"),
  );
  assertEquals(res.status, 200);
  const text = await res.text();
  assertEquals(text.includes("SPA"), true);
});

Deno.test("POST /api/checkins/ with trailing slash redirects 308", async () => {
  const { handler } = createTestApp();
  const res = await handler(
    new Request("http://localhost/api/checkins/", {
      method: "POST",
      body: new FormData(),
    }),
  );
  assertEquals(res.status, 308);
});
