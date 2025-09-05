// Cron/scheduled task routes
import { Hono } from "jsr:@hono/hono@4.9.6";

export function createCronRoutes() {
  const app = new Hono();

  // Checkin processing cron
  app.post("/api/cron/checkins", async (c) => {
    try {
      const { processRecentCheckins } = await import(
        "../ingestion/record-processor.ts"
      );

      const result = await processRecentCheckins();
      console.log("Cron checkin processing result:", result);

      return c.json({
        success: true,
        message:
          `Processed ${result.processed} checkins, ${result.saved} new records`,
        ...result,
      });
    } catch (err) {
      console.error("Cron checkin processing failed:", err);
      return c.json({
        success: false,
        error: `Checkin processing failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  // Follower sync cron
  app.post("/api/cron/followers", async (c) => {
    try {
      const { processFollowersFromQueue } = await import(
        "../ingestion/followers-processor.ts"
      );

      const result = await processFollowersFromQueue();
      console.log("Cron follower sync result:", result);

      return c.json({
        success: true,
        message:
          `Processed ${result.processedUsers} users, synced ${result.totalFollows} follows`,
        ...result,
      });
    } catch (err) {
      console.error("Cron follower sync failed:", err);
      return c.json({
        success: false,
        error: `Follower sync failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }, 500);
    }
  });

  return app;
}
