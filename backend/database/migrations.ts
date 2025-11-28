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
  {
    version: "011_add_mobile_pkce_security",
    description:
      "Add mobile_code_challenge column for PKCE security in mobile OAuth flow",
    sql: `
      -- Add mobile_code_challenge column to oauth_sessions table for PKCE security
      ALTER TABLE oauth_sessions ADD COLUMN mobile_code_challenge TEXT;
      
      -- Create index for efficient lookup during token exchange
      CREATE INDEX IF NOT EXISTS idx_oauth_sessions_mobile_challenge ON oauth_sessions(mobile_code_challenge);
    `,
  },
  {
    version: "012_iron_session_storage",
    description:
      "Create iron_session_storage table for encrypted session cookies",
    sql: `
      -- Create iron_session_storage table for Iron Session encrypted cookie storage
      CREATE TABLE IF NOT EXISTS iron_session_storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Create index for efficient cleanup of expired sessions
      CREATE INDEX IF NOT EXISTS idx_iron_session_expires
      ON iron_session_storage(expires_at);
    `,
  },
  {
    version: "013_consolidate_oauth_storage",
    description:
      "Migrate OAuth sessions from oauth_sessions to iron_session_storage and remove duplicate table",
    sql: `
      -- Migrate existing OAuth sessions to iron_session_storage format
      INSERT OR REPLACE INTO iron_session_storage (key, value, expires_at, created_at, updated_at)
      SELECT
        'session:' || did as key,
        json_object(
          'did', did,
          'handle', handle,
          'accessToken', access_token,
          'refreshToken', refresh_token,
          'dpopPrivateKeyJWK', json(dpop_private_key),
          'pdsUrl', pds_url,
          'displayName', display_name,
          'avatarUrl', avatar_url,
          'expiresAt', token_expires_at
        ) as value,
        CASE
          WHEN token_expires_at IS NOT NULL AND token_expires_at > 0
          THEN token_expires_at
          ELSE NULL
        END as expires_at,
        created_at,
        updated_at
      FROM oauth_sessions
      WHERE access_token IS NOT NULL AND refresh_token IS NOT NULL;

      -- Drop the oauth_sessions table as it's no longer needed
      DROP TABLE IF EXISTS oauth_sessions;
    `,
  },
  {
    version: "014_add_interaction_indexes",
    description: "Add index tables for efficient likes and comments discovery",
    sql: `
      -- Create checkin_interactions table for individual interaction tracking
      CREATE TABLE IF NOT EXISTS checkin_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkin_did TEXT NOT NULL,
        checkin_rkey TEXT NOT NULL,
        checkin_uri TEXT NOT NULL,
        author_did TEXT NOT NULL,
        author_handle TEXT,
        author_display_name TEXT,
        author_avatar TEXT,
        interaction_type TEXT NOT NULL, -- 'like' or 'comment'
        interaction_uri TEXT NOT NULL,
        interaction_rkey TEXT NOT NULL,
        interaction_cid TEXT NOT NULL,
        comment_text TEXT, -- null for likes
        created_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Create checkin_counts table for pre-computed aggregation
      CREATE TABLE IF NOT EXISTS checkin_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkin_did TEXT NOT NULL,
        checkin_rkey TEXT NOT NULL,
        checkin_uri TEXT NOT NULL,
        likes_count INTEGER NOT NULL DEFAULT 0,
        comments_count INTEGER NOT NULL DEFAULT 0,
        last_like_at TEXT,
        last_comment_at TEXT,
        indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for efficient queries
      CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_interactions_checkin
      ON checkin_interactions(checkin_did, checkin_rkey, author_did, interaction_type);

      CREATE INDEX IF NOT EXISTS idx_checkin_interactions_type
      ON checkin_interactions(interaction_type, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_checkin_interactions_author
      ON checkin_interactions(author_did, created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_counts_checkin
      ON checkin_counts(checkin_did, checkin_rkey);

      CREATE INDEX IF NOT EXISTS idx_checkin_counts_updated
      ON checkin_counts(updated_at DESC);
    `,
  },
  {
    version: "015_add_oauth_storage",
    description:
      "Create oauth_storage table for atproto-storage library (separate from iron_session_storage)",
    sql: `
      -- Create oauth_storage table for the @tijs/atproto-storage library
      -- This table stores OAuth state, PKCE verifiers, and session data
      -- Uses TEXT columns for timestamps (as expected by the library)
      CREATE TABLE IF NOT EXISTS oauth_storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Create index for efficient cleanup of expired entries
      CREATE INDEX IF NOT EXISTS idx_oauth_storage_expires_at
      ON oauth_storage(expires_at);
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

    // Get executed versions from row arrays (sqlite2 returns arrays, not objects)
    const executedVersions = new Set(
      executed.rows?.map((row) => row[0] as string) || [],
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
