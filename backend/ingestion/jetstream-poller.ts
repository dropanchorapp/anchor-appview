// @val-town jetstreamPoller
// Cron job: Runs every 15 minutes to ingest app.dropanchor.checkin records from Jetstream
import { db, initializeTables } from "../database/db.ts";
import { ATProtocolProfileResolver } from "../utils/profile-resolver.ts";
import { SqliteStorageProvider } from "../utils/storage-provider.ts";

export default async function () {
  const startTime = Date.now();
  let eventsProcessed = 0;
  let errors = 0;

  console.log("Starting Jetstream polling session...");

  // Initialize database tables - run on every execution for robustness
  await initializeTables();

  // Try to connect to Jetstream with retry logic
  let jetStreamSuccess = false;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Jetstream connection attempt ${attempt}/${maxRetries}...`);
      const result = await connectAndProcess();
      eventsProcessed = result.eventsProcessed;
      errors = result.errors;
      jetStreamSuccess = true;
      break;
    } catch (error) {
      console.error(`Jetstream connection attempt ${attempt} failed:`, error);
      errors++;

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Waiting ${backoffMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  // Fall back to comprehensive discovery if Jetstream fails
  if (!jetStreamSuccess) {
    console.log("Jetstream failed, falling back to comprehensive discovery...");
    const fallbackResult = await runComprehensiveDiscovery();
    eventsProcessed += fallbackResult.eventsProcessed;
    errors += fallbackResult.errors;
  }

  // Log this run
  const duration = Date.now() - startTime;

  // Use basic logging since cursor column doesn't exist yet
  await db.execute(
    `
    INSERT INTO processing_log (run_at, events_processed, errors, duration_ms) 
    VALUES (?, ?, ?, ?)
  `,
    [
      new Date().toISOString(),
      eventsProcessed,
      errors,
      duration,
    ],
  );

  // Log connection health status
  if (errors > 0) {
    console.log(
      `⚠️ Jetstream connection had ${errors} errors but completed with fallback`,
    );
  }

  console.log(
    `Polling completed: ${eventsProcessed} events, ${errors} errors, ${duration}ms`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      events_processed: eventsProcessed,
      errors,
      duration_ms: Date.now() - startTime,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

// Database initialization now handled by imported initializeTables function

function connectAndProcess(): Promise<
  { eventsProcessed: number; errors: number }
> {
  return new Promise((resolve, reject) => {
    let eventsProcessed = 0;
    let errors = 0;
    const sessionStartTime = Date.now();

    // Debug counters
    let totalMessages = 0;
    let commitMessages = 0;
    let checkinCommits = 0;
    let otherCommits = 0;
    let identityMessages = 0;
    let accountMessages = 0;
    const seenCollections = new Set<string>();
    const seenMessageTypes = new Set<string>();

    // Get the last processed timestamp from database for cursor-based resumption
    const lastTimestamp = getLastProcessedTimestamp();
    const cursorParam = lastTimestamp ? `&cursor=${lastTimestamp}` : "";
    const wsUrl =
      `wss://jetstream.atproto.tools/subscribe?wantedCollections=app.dropanchor.checkin${cursorParam}`;

    console.log(
      `Connecting to Jetstream with cursor: ${
        lastTimestamp || "none (live-tail)"
      }`,
    );
    console.log(`WebSocket URL: ${wsUrl}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      reject(new Error(`Failed to create WebSocket: ${error}`));
      return;
    }

    // Connection timeout - reject if not connected within 10 seconds
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.error("WebSocket connection timeout - not connected after 10s");
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }
    }, 10000);

    // Timeout for safety (50 seconds max - well under Val Town's 1 min free limit)
    const safetyTimeout = setTimeout(() => {
      console.log("Safety timeout reached, disconnecting");
      ws.close();
      resolve({ eventsProcessed, errors });
    }, 50000);

    // Auto-disconnect when no events received for 15 seconds (caught up)
    const inactivityTimeout = () => {
      return setTimeout(() => {
        console.log(
          "No events for 15 seconds, assuming caught up. Disconnecting.",
        );
        ws.close();
        resolve({ eventsProcessed, errors });
      }, 15000);
    };

    let inactivityTimer = inactivityTimeout();

    ws.onopen = () => {
      console.log("Connected to Jetstream WebSocket");
      clearTimeout(connectionTimeout);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        totalMessages++;

        // Reset inactivity timer on any message
        clearTimeout(inactivityTimer);
        inactivityTimer = inactivityTimeout();

        // Debug: Track message types
        if (data.kind) {
          seenMessageTypes.add(data.kind);

          if (data.kind === "commit") {
            commitMessages++;
            if (data.commit?.collection) {
              seenCollections.add(data.commit.collection);

              if (data.commit.collection === "app.dropanchor.checkin") {
                checkinCommits++;
              } else {
                otherCommits++;
              }
            }
          } else if (data.kind === "identity") {
            identityMessages++;
          } else if (data.kind === "account") {
            accountMessages++;
          }
        }

        if (
          data.kind === "commit" &&
          data.commit?.collection === "app.dropanchor.checkin" &&
          data.commit?.operation === "create"
        ) {
          console.log("Processing checkin event:", data.commit.rkey);
          await processCheckinEvent(data);
          eventsProcessed++;

          // Update last processed timestamp for next cursor
          if (data.time_us) {
            updateLastProcessedTimestamp(data.time_us);
          }
        }
      } catch (e) {
        console.error("Event processing error:", e);
        errors++;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error details:", {
        error: error,
        readyState: ws.readyState,
        url: wsUrl,
        time: new Date().toISOString(),
      });
      clearTimeout(connectionTimeout);
      clearTimeout(safetyTimeout);
      clearTimeout(inactivityTimer);

      // Provide more specific error message
      const errorMsg = error instanceof Error
        ? error.message
        : "Unknown WebSocket error";
      reject(new Error(`WebSocket connection failed: ${errorMsg}`));
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      clearTimeout(connectionTimeout);
      clearTimeout(safetyTimeout);
      clearTimeout(inactivityTimer);

      // Debug summary
      console.log("=== Jetstream Session Debug Summary ===");
      console.log(`Total messages received: ${totalMessages}`);
      console.log(`Message types: ${Array.from(seenMessageTypes).join(", ")}`);
      console.log(`Commit messages: ${commitMessages}`);
      console.log(`- Check-in commits: ${checkinCommits}`);
      console.log(`- Other commits: ${otherCommits}`);
      console.log(`Identity messages: ${identityMessages}`);
      console.log(`Account messages: ${accountMessages}`);

      if (seenCollections.size > 0) {
        const collections = Array.from(seenCollections);
        console.log(
          `Collections seen (${collections.length}): ${
            collections.slice(0, 10).join(", ")
          }${collections.length > 10 ? "..." : ""}`,
        );
      }

      console.log(`Check-ins processed: ${eventsProcessed}`);
      console.log(`Session duration: ${Date.now() - sessionStartTime}ms`);
      console.log("=== End Debug Summary ===");

      resolve({ eventsProcessed, errors });
    };
  });
}

async function processCheckinEvent(event: any) {
  const { commit, did } = event; // DID is at the top level!
  const record = commit.record;

  console.log(`Processing checkin ${commit.rkey} from DID ${did}`);

  // Check if already processed (duplicate detection)
  const existing = await db.execute(
    `SELECT id FROM checkins WHERE id = ?`,
    [commit.rkey],
  );

  console.log(
    `Duplicate check result for ${commit.rkey}:`,
    existing.rows ? existing.rows.length : "no rows",
  );

  if (existing.rows && existing.rows.length > 0) {
    console.log("Duplicate checkin, skipping:", commit.rkey);
    return;
  }

  // Extract coordinates from new format only
  const lat = record.coordinates?.latitude
    ? parseFloat(record.coordinates.latitude)
    : null;
  const lng = record.coordinates?.longitude
    ? parseFloat(record.coordinates.longitude)
    : null;

  // Resolve profile to get handle and other data
  const storage = new SqliteStorageProvider(db);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profile = await profileResolver.resolveProfile(did);
  const authorHandle = profile?.handle || did;

  // Insert checkin with StrongRef
  console.log(`Attempting to insert checkin ${commit.rkey} with data:`, {
    id: commit.rkey,
    uri: `at://${did}/${commit.collection}/${commit.rkey}`,
    author_did: did,
    text: record.text || "",
    lat,
    lng,
    addressRef: record.addressRef?.uri,
  });

  const insertResult = await db.execute(
    `
    INSERT OR IGNORE INTO checkins 
    (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      commit.rkey,
      `at://${did}/${commit.collection}/${commit.rkey}`,
      did,
      authorHandle,
      record.text || "",
      record.createdAt || new Date().toISOString(),
      lat,
      lng,
      record.addressRef?.uri || null,
      record.addressRef?.cid || null,
    ],
  );

  console.log("Insert result:", insertResult);
  console.log("Checkin stored:", commit.rkey);

  // Trigger address resolution if StrongRef is present
  if (record.addressRef?.uri) {
    console.log("Address StrongRef found, resolving:", record.addressRef.uri);

    // Import and call the address resolver
    try {
      const { resolveAndCacheAddress } = await import(
        "../utils/address-resolver.ts"
      );
      await resolveAndCacheAddress(commit.rkey, record.addressRef);
    } catch (error) {
      console.error("Address resolution failed:", error);
    }
  }
}

function getLastProcessedTimestamp(): string | null {
  // For now, always use 1 hour lookback since cursor column doesn't exist yet
  console.log("Using 1 hour lookback for cursor");
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const microseconds = oneHourAgo * 1000; // Convert to microseconds
  return microseconds.toString();
}

function updateLastProcessedTimestamp(timeUs: string): void {
  try {
    // We'll update this at the end of the run in the main logging
    // For now, just log it
    console.log(`Cursor update: ${timeUs}`);
  } catch (error) {
    console.error("Error storing cursor:", error);
  }
}

async function runComprehensiveDiscovery(): Promise<
  { eventsProcessed: number; errors: number }
> {
  let eventsProcessed = 0;
  let errors = 0;

  try {
    console.log("Running comprehensive discovery for checkin records...");

    // Import and run the comprehensive discovery system
    const { CheckinDiscoveryService } = await import(
      "../../scripts/comprehensive-checkin-discovery.ts"
    );
    const discoveryService = new CheckinDiscoveryService();

    // Discover DIDs across the network
    const socialGraphDids = await discoveryService.discoverFromSocialGraph();
    const searchDids = await discoveryService.searchATProtoNetwork();
    const allDids = [...new Set([...socialGraphDids, ...searchDids])];

    console.log(
      `Comprehensive discovery found ${allDids.length} DIDs to check`,
    );

    // Crawl all discovered repositories for new checkins
    const discoveredCheckins = await discoveryService.crawlRepositories(
      allDids,
    );

    // Store only new checkins (with duplicate checking)
    let stored = 0;
    for (const checkin of discoveredCheckins) {
      try {
        // Check if already exists
        const existing = await db.execute(
          "SELECT id FROM checkins WHERE id = ?",
          [checkin.rkey],
        );

        if (existing.rows && existing.rows.length > 0) {
          continue; // Skip existing
        }

        // Extract coordinates
        const lat = checkin.record.value.coordinates?.latitude || null;
        const lng = checkin.record.value.coordinates?.longitude || null;

        // Insert new checkin
        await db.execute(
          `
          INSERT OR IGNORE INTO checkins 
          (id, uri, author_did, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            checkin.rkey,
            checkin.uri,
            checkin.authorDid,
            checkin.record.value.text || "",
            checkin.record.value.createdAt || new Date().toISOString(),
            lat,
            lng,
            checkin.record.value.addressRef?.uri || null,
            checkin.record.value.addressRef?.cid || null,
          ],
        );

        stored++;
        console.log(
          `Stored new checkin via comprehensive discovery: ${checkin.rkey}`,
        );

        // Trigger address resolution
        if (checkin.record.value.addressRef?.uri) {
          try {
            const { resolveAndCacheAddress } = await import(
              "../utils/address-resolver.ts"
            );
            await resolveAndCacheAddress(
              checkin.rkey,
              checkin.record.value.addressRef,
            );
          } catch (error) {
            console.error("Address resolution failed:", error);
          }
        }
      } catch (error) {
        console.error(`Failed to store checkin ${checkin.rkey}:`, error);
        errors++;
      }
    }

    eventsProcessed = stored;
    console.log(
      `Comprehensive discovery completed: ${eventsProcessed} new checkins stored`,
    );
  } catch (error) {
    console.error("Comprehensive discovery failed:", error);
    errors++;
  }

  return { eventsProcessed, errors };
}
