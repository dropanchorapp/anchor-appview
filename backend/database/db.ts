// Simple database module using Val Town's sqlite
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

export const db = sqlite;

// Initialize all tables for full Anchor AppView functionality
export async function initializeTables() {
  // Initialize user tracking tables for PDS crawler
  const { initializeUserTables } = await import("./user-tracking.ts");
  await initializeUserTables();

  // Run migrations to update existing table schemas
  await runMigrations();
  // Main checkins table (updated for PDS crawler)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,                 -- record rkey
      uri TEXT UNIQUE NOT NULL,            -- full AT URI
      rkey TEXT NOT NULL,                  -- record rkey (separate column for queries)
      did TEXT NOT NULL,                   -- author DID (renamed from author_did)
      handle TEXT,                         -- author handle (renamed from author_handle)
      display_name TEXT,                   -- author display name
      avatar TEXT,                         -- author avatar URL
      text TEXT NOT NULL,                  -- checkin message
      created_at TEXT NOT NULL,            -- ISO timestamp
      
      -- Extracted coordinates
      latitude REAL,
      longitude REAL,
      
      -- Place information
      place_name TEXT,                     -- resolved place name
      category TEXT,                       -- place category
      category_group TEXT,                 -- category group
      category_icon TEXT,                  -- category icon
      
      -- Address reference (strongref)
      address_ref_uri TEXT,                -- URI to address record
      address_ref_cid TEXT,                -- content hash for verification
      
      -- Cached resolved address data
      cached_address_name TEXT,            -- venue name
      cached_address_street TEXT,          -- street address
      cached_address_locality TEXT,        -- city
      cached_address_region TEXT,          -- state/province
      cached_address_country TEXT,         -- country code
      cached_address_postal_code TEXT,     -- postal code
      cached_address_full JSON,            -- complete resolved address object
      
      -- Metadata
      address_resolved_at TEXT,            -- when address was last resolved
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Address cache for efficiency
  await db.execute(`
    CREATE TABLE IF NOT EXISTS address_cache (
      uri TEXT PRIMARY KEY,                -- address record URI
      cid TEXT,                           -- content hash
      name TEXT,
      street TEXT,
      locality TEXT,
      region TEXT,
      country TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      full_data JSON,                     -- complete address record
      resolved_at TEXT,                   -- when successfully fetched
      failed_at TEXT                      -- if resolution failed
    )
  `);

  // Profile cache for user data
  await db.execute(`
    CREATE TABLE IF NOT EXISTS profile_cache (
      did TEXT PRIMARY KEY,
      handle TEXT,
      display_name TEXT,
      avatar_url TEXT,
      description TEXT,
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      posts_count INTEGER DEFAULT 0,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Social graph for following feeds
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_did TEXT NOT NULL,
      following_did TEXT NOT NULL,
      created_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_did, following_did)
    )
  `);

  // Processing logs for monitoring
  await db.execute(`
    CREATE TABLE IF NOT EXISTS processing_log (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);

  // OAuth sessions (matching ATProto-OAuth-Guide schema)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      pds_url TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      dpop_private_key TEXT NOT NULL,  -- JWK format
      dpop_public_key TEXT NOT NULL,   -- JWK format
      session_id TEXT UNIQUE,          -- Session cookie ID
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Performance indexes
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at DESC)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_author ON checkins(did)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins(latitude, longitude)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_did)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_profile_updated ON profile_cache(updated_at DESC)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_oauth_sessions_updated ON oauth_sessions(updated_at DESC)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_oauth_sessions_session_id ON oauth_sessions(session_id)`,
  );
}

// Database migrations to update existing schemas
async function runMigrations() {
  console.log("🔄 Running database migrations...");

  try {
    // Check if rkey column exists in checkins table
    const tableInfo = await db.execute("PRAGMA table_info(checkins)");
    const columns = tableInfo.rows?.map((row) => (row as any).name) || [];

    if (!columns.includes("rkey")) {
      console.log("📝 Adding missing columns to checkins table...");

      // Add missing columns one by one
      const newColumns = [
        "rkey TEXT",
        "display_name TEXT",
        "avatar TEXT",
        "place_name TEXT",
        "category TEXT",
        "category_group TEXT",
        "category_icon TEXT",
      ];

      for (const column of newColumns) {
        try {
          await db.execute(`ALTER TABLE checkins ADD COLUMN ${column}`);
          console.log(`✅ Added column: ${column}`);
        } catch (_error) {
          // Column might already exist, ignore error
          console.log(
            `⏭️ Column ${column.split(" ")[0]} already exists or failed to add`,
          );
        }
      }

      // Rename existing columns if needed
      try {
        // SQLite doesn't support column renaming directly, so we need to check current schema
        if (columns.includes("author_did") && !columns.includes("did")) {
          // Create new table with correct schema, copy data, rename
          await db.execute(`
            CREATE TABLE checkins_new (
              id TEXT PRIMARY KEY,
              uri TEXT UNIQUE NOT NULL,
              rkey TEXT,
              did TEXT NOT NULL,
              handle TEXT,
              display_name TEXT,
              avatar TEXT,
              text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              latitude REAL,
              longitude REAL,
              place_name TEXT,
              category TEXT,
              category_group TEXT,
              category_icon TEXT,
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

          // Copy data from old table to new table
          await db.execute(`
            INSERT INTO checkins_new (
              id, uri, did, handle, text, created_at, latitude, longitude,
              address_ref_uri, address_ref_cid, cached_address_name,
              cached_address_street, cached_address_locality, cached_address_region,
              cached_address_country, cached_address_postal_code, cached_address_full,
              address_resolved_at, indexed_at
            )
            SELECT 
              id, uri, author_did, author_handle, text, created_at, latitude, longitude,
              address_ref_uri, address_ref_cid, cached_address_name,
              cached_address_street, cached_address_locality, cached_address_region,
              cached_address_country, cached_address_postal_code, cached_address_full,
              address_resolved_at, indexed_at
            FROM checkins
          `);

          // Replace old table with new table
          await db.execute("DROP TABLE checkins");
          await db.execute("ALTER TABLE checkins_new RENAME TO checkins");

          console.log("✅ Successfully migrated checkins table schema");
        }
      } catch (error) {
        console.error("⚠️ Schema migration failed:", error);
      }
    } else {
      console.log("✅ Checkins table schema is up to date");
    }

    // Check if last_follower_crawl column exists in anchor_users table
    const userTableInfo = await db.execute("PRAGMA table_info(anchor_users)");
    const userColumns = userTableInfo.rows?.map((row) => (row as any).name) ||
      [];

    if (!userColumns.includes("last_follower_crawl")) {
      console.log(
        "📝 Adding last_follower_crawl column to anchor_users table...",
      );
      try {
        await db.execute(
          "ALTER TABLE anchor_users ADD COLUMN last_follower_crawl TIMESTAMP",
        );
        console.log("✅ Added last_follower_crawl column");
      } catch (_error) {
        console.log(
          "⏭️ last_follower_crawl column already exists or failed to add",
        );
      }
    } else {
      console.log("✅ anchor_users table schema is up to date");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
  }
}

// Test the database connection
export async function testDatabase() {
  try {
    await initializeTables();
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    console.log("Database tables:", result.rows);
    return true;
  } catch (error) {
    console.error("Database test failed:", error);
    return false;
  }
}
