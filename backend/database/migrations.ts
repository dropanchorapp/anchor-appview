// Database migrations for Anchor AppView
// This provides proper schema versioning and safe migrations

import { rawDb } from "./db.ts";

// Migration tracking table
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    version TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    executed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

// List of all migrations in order
const MIGRATIONS = [
  {
    version: "001_initial_schema",
    description: "Create initial tables with Drizzle schema",
    sql: `
      -- Main checkins table with unified venue_name field
      CREATE TABLE IF NOT EXISTS checkins (
        id TEXT PRIMARY KEY,
        uri TEXT UNIQUE NOT NULL,
        rkey TEXT NOT NULL,
        did TEXT NOT NULL,
        handle TEXT,
        display_name TEXT,
        avatar TEXT,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        venue_name TEXT,  -- UNIFIED venue name field (no more confusion!)
        category TEXT,
        category_group TEXT,
        category_icon TEXT,
        address_ref_uri TEXT,
        address_ref_cid TEXT,
        address_street TEXT,
        address_locality TEXT,
        address_region TEXT,
        address_country TEXT,
        address_postal_code TEXT,
        address_full TEXT,
        address_resolved_at TEXT,
        indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Address cache table
      CREATE TABLE IF NOT EXISTS address_cache (
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
        full_data TEXT,
        resolved_at TEXT,
        failed_at TEXT
      );

      -- Profile cache table
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
      );

      -- User follows table for social graph
      CREATE TABLE IF NOT EXISTS user_follows (
        follower_did TEXT NOT NULL,
        following_did TEXT NOT NULL,
        created_at TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (follower_did, following_did)
      );

      -- User tracking for PDS crawling
      CREATE TABLE IF NOT EXISTS anchor_users (
        did TEXT PRIMARY KEY,
        handle TEXT,
        pds TEXT,
        last_checkin_crawl TEXT,
        last_follower_crawl TEXT,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Processing logs
      CREATE TABLE IF NOT EXISTS processing_log (
        id INTEGER PRIMARY KEY,
        run_at TEXT NOT NULL,
        events_processed INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        duration_ms INTEGER
      );

      -- OAuth sessions
      CREATE TABLE IF NOT EXISTS oauth_sessions (
        did TEXT PRIMARY KEY,
        handle TEXT NOT NULL,
        pds_url TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        dpop_private_key TEXT NOT NULL,
        dpop_public_key TEXT NOT NULL,
        token_expires_at INTEGER NOT NULL,
        session_id TEXT UNIQUE,
        display_name TEXT,
        avatar_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Display names for mobile users
      CREATE TABLE IF NOT EXISTS display_names (
        did TEXT PRIMARY KEY,
        display_name TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Performance indexes
      CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_checkins_author ON checkins(did);
      CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_did);
      CREATE INDEX IF NOT EXISTS idx_profile_updated ON profile_cache(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_oauth_sessions_updated ON oauth_sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_oauth_sessions_session_id ON oauth_sessions(session_id);
    `,
  },
  {
    version: "002_migrate_venue_names",
    description: "Migrate existing place_name data to unified venue_name field",
    sql: `
      -- Copy data from place_name to venue_name, fallback to cached_address_name
      UPDATE checkins 
      SET venue_name = COALESCE(place_name, cached_address_name)
      WHERE venue_name IS NULL;
    `,
  },
  {
    version: "003_clean_invalid_json",
    description: "Clean invalid JSON data in address_full columns",
    sql: `
      -- Fix invalid JSON data in checkins table
      UPDATE checkins 
      SET address_full = NULL
      WHERE address_full = 'address_full' OR address_full = '';

      -- Fix invalid JSON data in address_cache table  
      UPDATE address_cache
      SET full_data = NULL
      WHERE full_data = 'full_data' OR full_data = '';
    `,
  },
  {
    version: "004_comprehensive_json_cleanup",
    description: "Comprehensive cleanup of all invalid JSON data",
    sql: `
      -- Clean any remaining invalid JSON in checkins
      UPDATE checkins 
      SET address_full = NULL
      WHERE address_full IS NOT NULL 
        AND (address_full NOT LIKE '{%}' 
             OR address_full NOT LIKE '%}' 
             OR LENGTH(address_full) < 2);

      -- Clean any remaining invalid JSON in address_cache  
      UPDATE address_cache
      SET full_data = NULL
      WHERE full_data IS NOT NULL 
        AND (full_data NOT LIKE '{%}' 
             OR full_data NOT LIKE '%}' 
             OR LENGTH(full_data) < 2);
    `,
  },
  {
    version: "005_remove_unused_columns",
    description:
      "Remove unused database columns to clean up schema and prevent issues",
    sql: `
      -- Remove unused columns from checkins table that are not used by the API
      -- Note: SQLite doesn't support DROP COLUMN directly, so we'll create a clean table
      
      CREATE TABLE checkins_clean (
        id TEXT PRIMARY KEY,
        uri TEXT UNIQUE NOT NULL,
        rkey TEXT NOT NULL,
        did TEXT NOT NULL,
        handle TEXT,
        display_name TEXT,
        avatar TEXT,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        venue_name TEXT,  -- UNIFIED venue name field (USED)
        category TEXT,
        category_group TEXT,
        category_icon TEXT,
        -- Address components (USED in API responses)
        address_street TEXT,
        address_locality TEXT,
        address_region TEXT,
        address_country TEXT,
        address_postal_code TEXT,
        -- Metadata
        indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Copy only the data we actually need
      INSERT INTO checkins_clean (
        id, uri, rkey, did, handle, display_name, avatar, text, created_at,
        latitude, longitude, venue_name, category, category_group, category_icon,
        address_street, address_locality, address_region, address_country, 
        address_postal_code, indexed_at
      )
      SELECT 
        id, uri, rkey, did, handle, display_name, avatar, text, created_at,
        latitude, longitude, venue_name, category, category_group, category_icon,
        address_street, address_locality, address_region, address_country,
        address_postal_code, indexed_at
      FROM checkins;

      -- Replace old table with clean one
      DROP TABLE checkins;
      ALTER TABLE checkins_clean RENAME TO checkins;

      -- Recreate indexes on clean table
      CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_checkins_author ON checkins(did);
      CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins(latitude, longitude);
    `,
  },
  {
    version: "006_clean_address_cache",
    description: "Clean up address_cache table by removing unused columns",
    sql: `
      -- Create clean address_cache table without problematic JSON fields
      CREATE TABLE address_cache_clean (
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
        resolved_at TEXT
      );

      -- Copy only the useful data (skip problematic full_data and failed_at)
      INSERT INTO address_cache_clean (
        uri, cid, name, street, locality, region, country, postal_code,
        latitude, longitude, resolved_at
      )
      SELECT 
        uri, cid, name, street, locality, region, country, postal_code,
        latitude, longitude, resolved_at
      FROM address_cache;

      -- Replace old table
      DROP TABLE address_cache;
      ALTER TABLE address_cache_clean RENAME TO address_cache;
    `,
  },
  {
    version: "007_remove_unused_tables",
    description: "Remove completely unused tables identified by code audit",
    sql: `
      -- Remove address_cache table - completely unused by any active code
      DROP TABLE IF EXISTS address_cache;
      
      -- Remove display_names table - defined in schema but never used 
      DROP TABLE IF EXISTS display_names;
      
      -- Legacy tables checkins_v1 and address_cache_v1 removed along with universal-storage.ts
      -- All code now uses current schemas via Drizzle ORM
      
      -- NOTE: user_pdses is NOT legacy - it's critical PDS crawler infrastructure, keep it!
    `,
  },
  {
    version: "008_fix_anchor_users_columns",
    description: "Add missing columns to anchor_users table for PDS crawler",
    sql: `
      -- Add missing columns to anchor_users table if they don't exist
      -- These columns are required by the PDS crawler but might be missing on existing tables
      
      ALTER TABLE anchor_users ADD COLUMN last_checkin_crawl TEXT;
      ALTER TABLE anchor_users ADD COLUMN last_follower_crawl TEXT;
      ALTER TABLE anchor_users ADD COLUMN added_at TEXT DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE anchor_users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;
      
      -- Note: SQLite will ignore ADD COLUMN if the column already exists,
      -- so this is safe to run multiple times
    `,
  },
  {
    version: "009_fix_oauth_sessions_columns",
    description:
      "Add missing OAuth session columns for token expiration and user profile data",
    sql: `
      -- Add missing columns to oauth_sessions table if they don't exist
      -- These columns are required by the OAuth session management but might be missing
      
      ALTER TABLE oauth_sessions ADD COLUMN token_expires_at INTEGER DEFAULT 0;
      ALTER TABLE oauth_sessions ADD COLUMN display_name TEXT;
      ALTER TABLE oauth_sessions ADD COLUMN avatar_url TEXT;
      
      -- Note: SQLite will ignore ADD COLUMN if the column already exists,
      -- so this is safe to run multiple times
    `,
  },
  {
    version: "010_add_user_pdses_table",
    description: "Add user_pdses table for PDS reference counting",
    sql: `
      -- Create user_pdses table for PDS crawler infrastructure
      CREATE TABLE IF NOT EXISTS user_pdses (
        pds_url TEXT PRIMARY KEY,
        user_count INTEGER DEFAULT 1,
        last_crawled_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Create index for efficient querying
      CREATE INDEX IF NOT EXISTS idx_user_pdses_user_count ON user_pdses(user_count);
      CREATE INDEX IF NOT EXISTS idx_user_pdses_last_crawled ON user_pdses(last_crawled_at);
    `,
  },
];

export async function runMigrations() {
  console.log("🔄 Running Drizzle-based database migrations...");

  try {
    // Create migrations table
    await rawDb.execute({
      sql: MIGRATIONS_TABLE,
      args: [],
    });

    // Get already executed migrations
    const executed = await rawDb.execute({
      sql: "SELECT version FROM migrations ORDER BY id",
      args: [],
    });

    // Get executed versions from Row objects
    const executedVersions = new Set(
      executed.rows?.map((row) => row.version as string) || [],
    );

    // Run pending migrations
    for (const migration of MIGRATIONS) {
      if (!executedVersions.has(migration.version)) {
        console.log(
          `📝 Running migration: ${migration.version} - ${migration.description}`,
        );

        // Split SQL into individual statements (SQLite limitation)
        const statements = migration.sql
          .split(";")
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0);

        // Execute each statement
        for (const statement of statements) {
          try {
            await rawDb.execute({
              sql: statement,
              args: [],
            });
          } catch (error) {
            console.warn(
              `⚠️  Statement warning (likely table exists): ${error.message}`,
            );
          }
        }

        // Record migration as executed
        await rawDb.execute({
          sql: "INSERT INTO migrations (version, description) VALUES (?, ?)",
          args: [migration.version, migration.description],
        });

        console.log(`✅ Completed migration: ${migration.version}`);
      }
    }

    console.log("✅ All migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

export async function getMigrationStatus() {
  try {
    await rawDb.execute({
      sql: MIGRATIONS_TABLE,
      args: [],
    });
    const result = await rawDb.execute({
      sql:
        "SELECT version, description, executed_at FROM migrations ORDER BY id",
      args: [],
    });
    return result.rows || [];
  } catch (error) {
    console.error("Failed to get migration status:", error);
    return [];
  }
}
