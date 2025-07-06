// @val-town jetstreamPoller
// Cron job: Runs every 5 minutes to ingest app.dropanchor.checkin records from Jetstream
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

export default async function () {
  const startTime = Date.now();
  let eventsProcessed = 0;
  let errors = 0;

  console.log("Starting Jetstream polling session...");

  // Initialize database tables - run on every execution for robustness
  await initializeTables();

  // Connect to Jetstream and process events
  const result = await connectAndProcess();
  eventsProcessed = result.eventsProcessed;
  errors = result.errors;

  // Log this run
  const duration = Date.now() - startTime;
  await sqlite.execute(
    `
    INSERT INTO processing_log_v1 (run_at, events_processed, errors, duration_ms) 
    VALUES (?, ?, ?, ?)
  `,
    [
      new Date().toISOString(),
      eventsProcessed,
      errors,
      duration,
    ],
  );

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

async function initializeTables() {
  // Val Town pattern: Use table name constants for version management
  const CHECKINS_TABLE = "checkins_v1";
  const ADDRESS_CACHE_TABLE = "address_cache_v1";
  const PROCESSING_LOG_TABLE = "processing_log_v1";

  // Main checkins table
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS ${CHECKINS_TABLE} (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      author_handle TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      address_ref_uri TEXT,
      address_ref_cid TEXT,
      cached_address_name TEXT,
      cached_address_street TEXT,
      cached_address_locality TEXT,
      cached_address_region TEXT,
      cached_address_country TEXT,
      cached_address_postal_code TEXT,
      cached_address_full JSON,
      address_resolved_at TEXT,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Address cache table
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS ${ADDRESS_CACHE_TABLE} (
      uri TEXT PRIMARY KEY,
      cid TEXT,
      name TEXT,
      street TEXT,
      locality TEXT,
      region TEXT,
      country TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      full_data JSON,
      resolved_at TEXT,
      failed_at TEXT
    )
  `);

  // Processing logs table
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS ${PROCESSING_LOG_TABLE} (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);

  // Create indexes for performance
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_created ON ${CHECKINS_TABLE}(created_at DESC)`,
  );
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_author ON ${CHECKINS_TABLE}(author_did)`,
  );
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_location ON ${CHECKINS_TABLE}(latitude, longitude)`,
  );
}

async function connectAndProcess(): Promise<
  { eventsProcessed: number; errors: number }
> {
  return new Promise((resolve, reject) => {
    let eventsProcessed = 0;
    let errors = 0;

    const ws = new WebSocket(
      "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.dropanchor.checkin",
    );

    // 45 second collection window
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ eventsProcessed, errors });
    }, 45000);

    ws.onopen = () => {
      console.log("Connected to Jetstream WebSocket");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (
          data.kind === "commit" &&
          data.commit?.collection === "app.dropanchor.checkin" &&
          data.commit?.operation === "create"
        ) {
          console.log("Processing checkin event:", data.commit.rkey);
          await processCheckinEvent(data);
          eventsProcessed++;
        }
      } catch (e) {
        console.error("Event processing error:", e);
        errors++;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed"));
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      clearTimeout(timeout);
      resolve({ eventsProcessed, errors });
    };
  });
}

async function processCheckinEvent(event: any) {
  const { commit } = event;
  const record = commit.record;

  // Check if already processed (duplicate detection)
  const existing = await sqlite.execute(
    `SELECT id FROM checkins_v1 WHERE id = ?`,
    [commit.rkey],
  );
  if (existing.length > 0) {
    console.log("Duplicate checkin, skipping:", commit.rkey);
    return;
  }

  // Extract coordinates
  const lat = record.coordinates?.latitude
    ? parseFloat(record.coordinates.latitude)
    : null;
  const lng = record.coordinates?.longitude
    ? parseFloat(record.coordinates.longitude)
    : null;

  // For now, use DID as handle (will be resolved later)
  const authorHandle = commit.repo;

  // Insert checkin
  await sqlite.execute(
    `
    INSERT OR IGNORE INTO checkins_v1 
    (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      commit.rkey,
      `at://${commit.repo}/${commit.collection}/${commit.rkey}`,
      commit.repo,
      authorHandle,
      record.text || "",
      record.createdAt || new Date().toISOString(),
      lat,
      lng,
      record.addressRef?.uri || null,
      record.addressRef?.cid || null,
    ],
  );

  console.log("Checkin stored:", commit.rkey);

  // TODO: Trigger address resolution if needed
  if (record.addressRef?.uri) {
    console.log(
      "Address ref found, will resolve later:",
      record.addressRef.uri,
    );
  }
}
