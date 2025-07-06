// @val-town debugAnchor
// HTTP debug endpoint for Val Town debugging
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'all';
  
  const output: string[] = [];
  
  try {
    output.push("🔍 Anchor AppView Debug (Val Town)");
    output.push("=".repeat(40));
    output.push(`Action: ${action}`);
    output.push("");
    
    // Initialize tables first
    await initializeTables();
    
    switch (action) {
      case 'db':
        await debugDatabase(output);
        break;
      case 'jetstream':
        await debugJetstream(output);
        break;
      case 'address':
        await debugAddressResolution(output);
        break;
      default:
        await debugDatabase(output);
        await debugJetstream(output);
        await debugAddressResolution(output);
    }
    
    return new Response(output.join('\n'), {
      headers: { "Content-Type": "text/plain" }
    });
    
  } catch (error) {
    output.push(`❌ Debug error: ${error.message}`);
    output.push(`Stack: ${error.stack}`);
    return new Response(output.join('\n'), {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
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
    CREATE TABLE IF NOT EXISTS processing_log_v1 (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);
}

async function debugDatabase(output: string[]): Promise<void> {
  output.push("📊 Database Status:");
  
  try {
    // Check table existence
    const tables = await sqlite.execute(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `);
    const tableNames = tables.rows ? tables.rows.map(t => t.name).join(', ') : 'No tables';
    output.push(`   Tables: ${tableNames}`);
    
    // Check checkins
    const checkins = await sqlite.execute(`SELECT COUNT(*) as count FROM checkins_v1`);
    const checkinCount = checkins.rows && checkins.rows[0] ? checkins.rows[0].count : 0;
    output.push(`   Checkins: ${checkinCount}`);
    
    if (checkinCount > 0) {
      const sample = await sqlite.execute(`SELECT * FROM checkins_v1 LIMIT 1`);
      if (sample.rows && sample.rows[0]) {
        output.push(`   Sample: ${JSON.stringify(sample.rows[0])}`);
      }
    }
    
    // Check processing logs
    const logs = await sqlite.execute(`
      SELECT * FROM processing_log_v1 ORDER BY run_at DESC LIMIT 3
    `);
    const logCount = logs.rows ? logs.rows.length : 0;
    output.push(`   Recent logs: ${logCount}`);
    
    if (logs.rows) {
      logs.rows.forEach((log, i) => {
        output.push(`     ${i+1}. ${log.run_at}: ${log.events_processed} events, ${log.errors} errors`);
      });
    }
    
  } catch (error) {
    output.push(`   ❌ Database error: ${error.message}`);
  }
  
  output.push("");
}

async function debugJetstream(output: string[]): Promise<void> {
  output.push("🌊 Jetstream Test:");
  
  try {
    // Quick Jetstream connection test
    const ws = new WebSocket("wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.dropanchor.checkin");
    
    let connected = false;
    let messageCount = 0;
    let checkinEvents = 0;
    const messageTypes: string[] = [];
    const collections: string[] = [];
    
    const promise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve();
      }, 10000); // 10 second test for more data
      
      ws.onopen = () => {
        connected = true;
        output.push("   ✅ Connected to Jetstream");
      };
      
      ws.onmessage = (event) => {
        messageCount++;
        try {
          const data = JSON.parse(event.data);
          
          // Capture message types and collections
          if (data.kind) {
            messageTypes.push(data.kind);
          }
          if (data.commit?.collection) {
            collections.push(data.commit.collection);
          }
          
          // Check for our target events
          if (data.commit?.collection === "app.dropanchor.checkin") {
            checkinEvents++;
            output.push(`   🎯 Check-in event: ${data.commit.rkey} (${data.kind}/${data.commit.operation})`);
          }
          
          // Log any dropanchor related events
          if (data.commit?.collection?.includes('dropanchor')) {
            output.push(`   📍 Dropanchor event: ${data.commit.collection} - ${data.commit.rkey}`);
          }
          
        } catch (e) {
          output.push(`   ⚠️ Parse error: ${e.message}`);
        }
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
        resolve();
      };
      
      ws.onerror = () => {
        output.push("   ❌ WebSocket error");
        clearTimeout(timeout);
        resolve();
      };
    });
    
    await promise;
    
    output.push(`   Messages received: ${messageCount}`);
    output.push(`   Check-in events: ${checkinEvents}`);
    output.push(`   Connection: ${connected ? 'Success' : 'Failed'}`);
    
    // Show unique message types and collections
    const uniqueTypes = [...new Set(messageTypes)];
    const uniqueCollections = [...new Set(collections)];
    
    if (uniqueTypes.length > 0) {
      output.push(`   Message types: ${uniqueTypes.join(', ')}`);
    }
    if (uniqueCollections.length > 0) {
      output.push(`   Collections seen: ${uniqueCollections.slice(0, 5).join(', ')}${uniqueCollections.length > 5 ? '...' : ''}`);
    }
    
  } catch (error) {
    output.push(`   ❌ Jetstream error: ${error.message}`);
  }
  
  output.push("");
}

async function debugAddressResolution(output: string[]): Promise<void> {
  output.push("🏠 Address Resolution Test:");
  
  try {
    // Test address resolution with known URI
    const testUri = "at://did:plc:wxex3wx5k4ctciupsv5m5stb/community.lexicon.location.address/3ltck5h4okl2r";
    
    output.push(`   Testing: ${testUri}`);
    
    // Parse URI
    const parts = testUri.replace('at://', '').split('/');
    const [did, collection, rkey] = parts;
    
    output.push(`   Parsed: ${did} / ${collection} / ${rkey}`);
    
    // Try to resolve (this might fail without proper AT Protocol resolution)
    const url = "https://bsky.social/xrpc/com.atproto.repo.getRecord";
    const params = new URLSearchParams({
      repo: did,
      collection: collection,
      rkey: rkey
    });
    
    const response = await fetch(`${url}?${params}`);
    output.push(`   Resolution: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      output.push(`   Address: ${JSON.stringify(data.value)}`);
    }
    
  } catch (error) {
    output.push(`   ❌ Address resolution error: ${error.message}`);
  }
  
  output.push("");
}