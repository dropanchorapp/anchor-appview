-- Anchor AppView Database Schema for Val Town SQLite
-- Phase 1: Core Infrastructure

-- Main checkins table
CREATE TABLE IF NOT EXISTS checkins_v1 (
  id TEXT PRIMARY KEY,                 -- record rkey
  uri TEXT UNIQUE NOT NULL,            -- full AT URI
  author_did TEXT NOT NULL,            -- creator DID
  author_handle TEXT,                  -- cached handle for display
  text TEXT NOT NULL,                  -- checkin message
  created_at TEXT NOT NULL,            -- ISO timestamp
  
  -- Extracted coordinates
  latitude REAL,
  longitude REAL,
  
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
);

-- Address cache for efficiency
CREATE TABLE IF NOT EXISTS address_cache_v1 (
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
);

-- Social graph for following feeds (v2)
CREATE TABLE IF NOT EXISTS user_follows_v1 (
  follower_did TEXT NOT NULL,
  following_did TEXT NOT NULL,
  created_at TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_did, following_did)
);

-- Processing logs for monitoring
CREATE TABLE IF NOT EXISTS processing_log_v1 (
  id INTEGER PRIMARY KEY,
  run_at TEXT NOT NULL,
  events_processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  duration_ms INTEGER
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins_v1(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_author ON checkins_v1(author_did);
CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins_v1(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows_v1(follower_did);