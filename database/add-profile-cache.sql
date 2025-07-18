-- Migration: Add profile cache table for storing resolved AT Protocol profiles
-- This enables efficient profile data serving without client-side resolution

-- Profile cache table
CREATE TABLE IF NOT EXISTS profile_cache_v1 (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  display_name TEXT,
  avatar TEXT,
  description TEXT,
  -- Metadata
  fetched_at TEXT NOT NULL,
  updated_at TEXT,
  -- Full profile data for future fields
  full_data JSON
);

-- Index for finding stale profiles that need refresh
CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profile_cache_v1(updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_fetched ON profile_cache_v1(fetched_at);