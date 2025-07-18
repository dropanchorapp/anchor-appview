// @val-town jetstreamPoller
// Cron job: Runs every 15 minutes to ingest app.dropanchor.checkin records from Jetstream
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";
import { ATProtocolProfileResolver } from "../utils/profile-resolver-v2.ts";
import { SqliteStorageProvider } from "../utils/storage-provider.ts";

export default async function () {
  const startTime = Date.now();
  let eventsProcessed = 0;
  let errors = 0;

  console.log("Starting Jetstream polling session...");

  // Initialize database tables - run on every execution for robustness
  await initializeTables();

  // Connect to Jetstream with cursor-based resumption
  const result = await connectAndProcess();
  eventsProcessed = result.eventsProcessed;
  errors = result.errors;

  // If Jetstream found no events, fall back to AT Protocol polling
  if (eventsProcessed === 0) {
    console.log("No events from Jetstream, trying AT Protocol polling fallback...");
    const fallbackResult = await pollATProtocolForNewCheckins();
    eventsProcessed += fallbackResult.eventsProcessed;
    errors += fallbackResult.errors;
  }

  // Log this run
  const duration = Date.now() - startTime;
  
  // Use basic logging since cursor column doesn't exist yet
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

  // Ensure profile cache table exists
  const storage = new SqliteStorageProvider(sqlite);
  await storage.ensureTablesExist();

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
      duration_ms INTEGER,
      last_jetstream_cursor TEXT
    )
  `);

  // Add cursor column if it doesn't exist (for existing tables)
  try {
    await sqlite.execute(`ALTER TABLE ${PROCESSING_LOG_TABLE} ADD COLUMN last_jetstream_cursor TEXT`);
  } catch (_e) {
    // Column already exists, ignore error
  }

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

function connectAndProcess(): Promise<
  { eventsProcessed: number; errors: number }
> {
  return new Promise((resolve, reject) => {
    let eventsProcessed = 0;
    let errors = 0;
    const _isProcessingHistorical = true;
    let _lastEventTime = Date.now();
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
    const cursorParam = lastTimestamp ? `&cursor=${lastTimestamp}` : '';
    const wsUrl = `wss://jetstream.atproto.tools/subscribe?wantedCollections=app.dropanchor.checkin${cursorParam}`;
    
    console.log(`Connecting to Jetstream with cursor: ${lastTimestamp || 'none (live-tail)'}`);
    const ws = new WebSocket(wsUrl);

    // Timeout for safety (50 seconds max - well under Val Town's 1 min free limit)
    const safetyTimeout = setTimeout(() => {
      console.log("Safety timeout reached, disconnecting");
      ws.close();
      resolve({ eventsProcessed, errors });
    }, 50000);

    // Auto-disconnect when no events received for 15 seconds (caught up)
    const inactivityTimeout = () => {
      return setTimeout(() => {
        console.log("No events for 15 seconds, assuming caught up. Disconnecting.");
        ws.close();
        resolve({ eventsProcessed, errors });
      }, 15000);
    };
    
    let inactivityTimer = inactivityTimeout();

    ws.onopen = () => {
      console.log("Connected to Jetstream WebSocket");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        totalMessages++;

        // Reset inactivity timer on any message
        clearTimeout(inactivityTimer);
        inactivityTimer = inactivityTimeout();
        _lastEventTime = Date.now();

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
      console.error("WebSocket error:", error);
      clearTimeout(safetyTimeout);
      clearTimeout(inactivityTimer);
      reject(new Error("WebSocket connection failed"));
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
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
        console.log(`Collections seen (${collections.length}): ${collections.slice(0, 10).join(", ")}${collections.length > 10 ? "..." : ""}`);
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
  const existing = await sqlite.execute(
    `SELECT id FROM checkins_v1 WHERE id = ?`,
    [commit.rkey],
  );
  
  console.log(`Duplicate check result for ${commit.rkey}:`, existing.rows ? existing.rows.length : 'no rows');
  
  if (existing.rows && existing.rows.length > 0) {
    console.log("Duplicate checkin, skipping:", commit.rkey);
    return;
  }

  // Extract coordinates from new format only
  const lat = record.coordinates?.latitude ? parseFloat(record.coordinates.latitude) : null;
  const lng = record.coordinates?.longitude ? parseFloat(record.coordinates.longitude) : null;

  // Resolve profile to get handle and other data
  const storage = new SqliteStorageProvider(sqlite);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profile = await profileResolver.resolveProfile(did);
  const authorHandle = profile?.handle || did;

  // Insert checkin with StrongRef
  console.log(`Attempting to insert checkin ${commit.rkey} with data:`, {
    id: commit.rkey,
    uri: `at://${did}/${commit.collection}/${commit.rkey}`,
    author_did: did,
    text: record.text || "",
    lat, lng,
    addressRef: record.addressRef?.uri
  });
  
  const insertResult = await sqlite.execute(
    `
    INSERT OR IGNORE INTO checkins_v1 
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
      const { resolveAndCacheAddress } = await import("../utils/address-resolver.ts");
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

let _currentCursor: string | null = null;

function updateLastProcessedTimestamp(timeUs: string): void {
  try {
    _currentCursor = timeUs;
    // We'll update this at the end of the run in the main logging
  } catch (error) {
    console.error("Error storing cursor:", error);
  }
}

async function pollATProtocolForNewCheckins(): Promise<{ eventsProcessed: number; errors: number }> {
  let eventsProcessed = 0;
  let errors = 0;

  // Known DIDs that create check-ins
  const knownDids = [
    "did:plc:wxex3wx5k4ctciupsv5m5stb",
    "did:plc:z4r4rg2j6eoqqxzkgr36xqzb"
  ];

  for (const did of knownDids) {
    try {
      console.log(`Polling AT Protocol for new check-ins from ${did}...`);
      
      const url = "https://bsky.social/xrpc/com.atproto.repo.listRecords";
      const params = new URLSearchParams({
        repo: did,
        collection: "app.dropanchor.checkin",
        limit: "20", // Check more recent records since we run every 15 min
        reverse: "true"
      });
      
      const response = await fetch(`${url}?${params}`);
      if (!response.ok) {
        console.error(`Failed to fetch records for ${did}: ${response.status}`);
        errors++;
        continue;
      }
      
      const data = await response.json();
      const records = data.records || [];
      console.log(`Found ${records.length} total records for ${did}`);
      
      for (const record of records) {
        const rkey = record.uri.split('/').pop();
        
        // Only process new format with addressRef
        if (!record.value.addressRef) {
          continue;
        }
        
        // Check if already exists
        const existing = await sqlite.execute(
          `SELECT id FROM checkins_v1 WHERE id = ?`,
          [rkey]
        );
        if (existing.length > 0) {
          continue; // Already exists
        }
        
        // This is a new check-in! Process it
        console.log(`Found new check-in via AT Protocol: ${rkey}`);
        
        // Extract coordinates
        const lat = record.value.coordinates?.latitude ? parseFloat(record.value.coordinates.latitude) : null;
        const lng = record.value.coordinates?.longitude ? parseFloat(record.value.coordinates.longitude) : null;
        
        // Insert checkin
        await sqlite.execute(
          `
          INSERT OR IGNORE INTO checkins_v1 
          (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            rkey,
            record.uri,
            did,
            did, // Will be updated with resolved handle later
            record.value.text || "",
            record.value.createdAt || new Date().toISOString(),
            lat,
            lng,
            record.value.addressRef?.uri || null,
            record.value.addressRef?.cid || null,
          ]
        );
        
        console.log("New checkin stored via AT Protocol polling:", rkey);
        eventsProcessed++;
        
        // Trigger address resolution
        if (record.value.addressRef?.uri) {
          try {
            const { resolveAndCacheAddress } = await import("../utils/address-resolver.ts");
            await resolveAndCacheAddress(rkey, record.value.addressRef);
          } catch (error) {
            console.error("Address resolution failed:", error);
          }
        }
      }
      
    } catch (error) {
      console.error(`Error polling ${did}:`, error);
      errors++;
    }
  }

  return { eventsProcessed, errors };
}
