// @val-town backfillHistoricalCheckins
// One-time script to backfill existing check-in records from AT Protocol
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

const BLUESKY_PDS = "https://bsky.social";

async function getCheckinRecords(did: string): Promise<any[]> {
  const url = `${BLUESKY_PDS}/xrpc/com.atproto.repo.listRecords`;
  const params = new URLSearchParams({
    repo: did,
    collection: "app.dropanchor.checkin",
    limit: "100",
    reverse: "true"
  });
  
  const response = await fetch(`${url}?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch records: ${response.status}`);
  }
  
  const data = await response.json();
  return data.records || [];
}

async function initializeTables(): Promise<void> {
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
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

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS address_cache_v1 (
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

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS processing_log_v1 (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);
}

async function processCheckinRecord(record: any, authorDid: string): Promise<boolean> {
  const rkey = record.uri.split('/').pop();
  
  // Only process new format with addressRef StrongRefs
  if (!record.value.addressRef) {
    return false; // Skip legacy format
  }
  
  // Check if already exists
  const existing = await sqlite.execute(
    `SELECT id FROM checkins_v1 WHERE id = ?`,
    [rkey]
  );
  if (existing.length > 0) {
    return false; // Already exists
  }
  
  // Extract coordinates from new format
  const lat = record.value.coordinates?.latitude ? parseFloat(record.value.coordinates.latitude) : null;
  const lng = record.value.coordinates?.longitude ? parseFloat(record.value.coordinates.longitude) : null;
  
  // Insert checkin with StrongRef
  await sqlite.execute(
    `
    INSERT OR IGNORE INTO checkins_v1 
    (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      rkey,
      record.uri,
      authorDid,
      authorDid, // Use DID as handle for now
      record.value.text || "",
      record.value.createdAt || new Date().toISOString(),
      lat,
      lng,
      record.value.addressRef?.uri || null,
      record.value.addressRef?.cid || null,
    ]
  );
  
  // Trigger address resolution if needed
  if (record.value.addressRef?.uri) {
    try {
      // Import and call the address resolver (if available in this context)
      const { resolveAndCacheAddress } = await import("../src/utils/address-resolver.ts");
      await resolveAndCacheAddress(rkey, record.value.addressRef);
    } catch (error) {
      console.log(`   ⚠️  Address resolution failed for ${rkey}: ${error.message}`);
    }
  }
  
  return true; // New record added
}

export default async function(): Promise<Response> {
  const output: string[] = [];
  let totalProcessed = 0;
  let totalAdded = 0;
  let errors = 0;
  
  try {
    output.push("🔄 Backfilling historical check-in records...");
    await initializeTables();
    
    // Known DIDs that have check-in records
    const knownDids = [
      "did:plc:wxex3wx5k4ctciupsv5m5stb",
      "did:plc:z4r4rg2j6eoqqxzkgr36xqzb"
    ];
    
    for (const did of knownDids) {
      output.push(`\n🔍 Processing DID: ${did}`);
      
      try {
        const records = await getCheckinRecords(did);
        output.push(`   Found ${records.length} records`);
        
        for (const record of records) {
          totalProcessed++;
          const added = await processCheckinRecord(record, did);
          if (added) {
            totalAdded++;
            output.push(`   ✅ Added: ${record.uri.split('/').pop()}`);
          } else {
            output.push(`   ⏭️  Skipped (exists): ${record.uri.split('/').pop()}`);
          }
        }
        
      } catch (error) {
        errors++;
        output.push(`   ❌ Error processing ${did}: ${error.message}`);
      }
    }
    
    // Log the backfill run
    await sqlite.execute(
      `INSERT INTO processing_log_v1 (run_at, events_processed, errors, duration_ms) VALUES (?, ?, ?, ?)`,
      [new Date().toISOString(), totalAdded, errors, Date.now()]
    );
    
    output.push(`\n📊 Backfill Summary:`);
    output.push(`   Records processed: ${totalProcessed}`);
    output.push(`   New records added: ${totalAdded}`);
    output.push(`   Errors: ${errors}`);
    output.push(`\n🏁 Backfill complete!`);
    
    return new Response(output.join('\n'), {
      headers: { "Content-Type": "text/plain" }
    });
    
  } catch (error) {
    output.push(`\n❌ Backfill failed: ${error.message}`);
    return new Response(output.join('\n'), {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}