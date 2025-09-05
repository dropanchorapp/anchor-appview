// Admin API routes
import { Hono } from "jsr:@hono/hono@4.9.6";
import { getDashboardStats } from "../database/queries.ts";

export function createAdminRoutes() {
  const app = new Hono();

  // Admin stats
  app.get("/api/admin/stats", async (c) => {
    try {
      const stats = await getDashboardStats();
      return c.json(stats);
    } catch (_err) {
      return c.json({ error: "Failed to get stats" }, 500);
    }
  });

  // Backfill addresses
  app.post("/api/admin/backfill-addresses", async (c) => {
    try {
      const { backfillAddresses } = await import(
        "../admin/backfill-addresses.ts"
      );
      const result = await backfillAddresses();
      return c.json({
        success: true,
        message:
          `Backfilled addresses for ${result.resolved} records, ${result.failed} failed`,
        resolved: result.resolved,
        failed: result.failed,
        errors: result.errors,
      });
    } catch (err) {
      console.error("Address backfill failed:", err);
      return c.json({
        success: false,
        error: `Address backfill failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Backfill profiles
  app.post("/api/admin/backfill-profiles", async (c) => {
    try {
      const { ATProtocolProfileResolver } = await import(
        "../utils/profile-resolver.ts"
      );
      const { SqliteStorageProvider } = await import(
        "../utils/storage-provider.ts"
      );

      const { sqlite } = await import("https://esm.town/v/std/sqlite2");
      const storage = new SqliteStorageProvider(sqlite);
      const resolver = new ATProtocolProfileResolver(storage);

      const refreshedCount = await resolver.refreshStaleProfiles();

      return c.json({
        success: true,
        message: `Refreshed ${refreshedCount} profiles, 0 failed`,
        refreshed: refreshedCount,
        failed: 0,
        errors: [],
      });
    } catch (err) {
      console.error("Profile backfill failed:", err);
      return c.json({
        success: false,
        error: `Profile backfill failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Test profile
  app.get("/api/admin/test-profile", async (c) => {
    try {
      const { ATProtocolProfileResolver } = await import(
        "../utils/profile-resolver.ts"
      );
      const { SqliteStorageProvider } = await import(
        "../utils/storage-provider.ts"
      );

      const { sqlite } = await import("https://esm.town/v/std/sqlite2");
      const storage = new SqliteStorageProvider(sqlite);
      const resolver = new ATProtocolProfileResolver(storage);

      const testDid = "did:plc:u5cwb2mwiv2bfq53cjufe6yn";
      const profile = await resolver.resolveProfile(testDid);

      return c.json({ did: testDid, profile });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  // Check users
  app.get("/api/admin/check-users", async (c) => {
    try {
      const { checkExistingUsers } = await import(
        "../admin/check-existing-users.ts"
      );
      const result = await checkExistingUsers();
      return c.json(result);
    } catch (err) {
      return c.json({
        error: `Check users failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Simple user check
  app.get("/api/admin/simple-user-check", async (c) => {
    try {
      const { simpleUserCheck } = await import("../admin/simple-user-check.ts");
      const result = await simpleUserCheck();
      return c.json(result);
    } catch (err) {
      return c.json({
        error: `Simple user check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // DB diagnostic
  app.get("/api/admin/db-diagnostic", async (c) => {
    try {
      const { dbDiagnostic } = await import("../admin/db-diagnostic.ts");
      const result = await dbDiagnostic();
      return c.json(result);
    } catch (err) {
      return c.json({
        error: `DB diagnostic failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // User sync diagnostic
  app.get("/api/admin/user-sync-diagnostic", async (c) => {
    try {
      const { userSyncDiagnostic } = await import(
        "../admin/user-sync-diagnostic.ts"
      );
      const result = await userSyncDiagnostic();
      return c.json(result);
    } catch (err) {
      return c.json({
        error: `User sync diagnostic failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Sync missing users
  app.post("/api/admin/sync-missing-users", async (c) => {
    try {
      const { syncMissingUsers } = await import(
        "../admin/sync-missing-users.ts"
      );
      const result = await syncMissingUsers();
      return c.json(result);
    } catch (err) {
      return c.json({
        error: `Sync missing users failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Run migrations
  app.post("/api/admin/run-migrations", async (c) => {
    try {
      const { runMigrationsManually } = await import(
        "../admin/run-migrations.ts"
      );
      const result = await runMigrationsManually();
      return c.json({
        success: true,
        message: `Ran ${result.applied} migrations successfully`,
        applied: result.applied,
        migrations: result.migrations,
      });
    } catch (err) {
      return c.json({
        success: false,
        error: `Migration failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Crawl followers
  app.post("/api/admin/crawl-followers", async (c) => {
    try {
      const { crawlFollowers } = await import(
        "../ingestion/followers-crawler.ts"
      );
      const response = await crawlFollowers();
      const result = await response.json();
      return c.json({
        success: true,
        message: `Crawled followers for ${result.users_processed} users`,
        processedUsers: result.users_processed,
        totalFollows: result.follows_processed,
        errors: result.errors,
      });
    } catch (err) {
      return c.json({
        success: false,
        error: `Follower crawl failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Manual backfill (legacy)
  app.post("/api/admin/backfill", async (c) => {
    try {
      const { backfillCheckins } = await import(
        "../admin/backfill-checkins.ts"
      );
      const response = await backfillCheckins();
      const result = await response.json();
      return c.json({
        success: true,
        message:
          `Backfilled ${result.results.checkinsStored} checkins, ${result.results.errors} errors`,
        saved: result.results.checkinsStored,
        errors: result.results.errors,
      });
    } catch (err) {
      return c.json({
        success: false,
        error: `Backfill failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  return app;
}
