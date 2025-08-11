// Drizzle schema definitions for Anchor AppView database
// This provides type safety and prevents field name mismatches

import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "https://esm.sh/drizzle-orm/sqlite-core";
import { sql } from "https://esm.sh/drizzle-orm";

// Main checkins table - single source of truth for all checkin data
export const checkinsTable = sqliteTable("checkins", {
  // Primary identifiers
  id: text("id").primaryKey(), // record rkey
  uri: text("uri").notNull().unique(), // full AT URI
  rkey: text("rkey").notNull(), // record rkey (separate column for queries)

  // Author information
  did: text("did").notNull(), // author DID
  handle: text("handle"), // author handle
  displayName: text("display_name"), // author display name
  avatar: text("avatar"), // author avatar URL

  // Content
  text: text("text").notNull(), // checkin message
  createdAt: text("created_at").notNull(), // ISO timestamp

  // Location coordinates
  latitude: real("latitude"),
  longitude: real("longitude"),

  // SINGLE venue name field - this eliminates the confusion between place_name and cached_address_name
  venueName: text("venue_name"), // resolved place name (unified field)

  // Place categorization
  category: text("category"), // place category
  categoryGroup: text("category_group"), // category group
  categoryIcon: text("category_icon"), // category icon

  // Resolved address components (used in API responses)
  addressStreet: text("address_street"), // street address
  addressLocality: text("address_locality"), // city
  addressRegion: text("address_region"), // state/province
  addressCountry: text("address_country"), // country code
  addressPostalCode: text("address_postal_code"), // postal code

  // Metadata
  indexedAt: text("indexed_at").default(sql`CURRENT_TIMESTAMP`),
});

// Address cache table - REMOVED in migration 007 as it was completely unused by active code
// If address caching is needed in future, re-implement with actual usage
// export const addressCacheTable = sqliteTable("address_cache", { ... });

// Profile cache for user data
export const profileCacheTable = sqliteTable("profile_cache", {
  did: text("did").primaryKey(),
  handle: text("handle"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  description: text("description"),
  followersCount: integer("followers_count").default(0),
  followingCount: integer("following_count").default(0),
  postsCount: integer("posts_count").default(0),
  indexedAt: text("indexed_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Social graph for following feeds
export const userFollowsTable = sqliteTable("user_follows", {
  followerDid: text("follower_did").notNull(),
  followingDid: text("following_did").notNull(),
  createdAt: text("created_at"),
  syncedAt: text("synced_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ columns: [table.followerDid, table.followingDid] }),
}));

// User tracking for PDS crawling
export const anchorUsersTable = sqliteTable("anchor_users", {
  did: text("did").primaryKey(),
  handle: text("handle").notNull(), // Match actual table structure
  pdsUrl: text("pds_url").notNull(), // Match actual column name
  registeredAt: text("registered_at").default(sql`CURRENT_TIMESTAMP`), // Match actual column name
  lastCrawledAt: text("last_crawled_at"), // Match actual column name
  lastCheckinCrawl: text("last_checkin_crawl"), // timestamp
  lastFollowerCrawl: text("last_follower_crawl"), // timestamp
});

// Processing logs for monitoring
export const processingLogTable = sqliteTable("processing_log", {
  id: integer("id").primaryKey(),
  runAt: text("run_at").notNull(),
  eventsProcessed: integer("events_processed").default(0),
  errors: integer("errors").default(0),
  durationMs: integer("duration_ms"),
});

// OAuth sessions (matching ATProto-OAuth-Guide schema)
export const oauthSessionsTable = sqliteTable("oauth_sessions", {
  did: text("did").primaryKey(),
  handle: text("handle").notNull(),
  pdsUrl: text("pds_url").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  dpopPrivateKey: text("dpop_private_key").notNull(), // JWK format
  dpopPublicKey: text("dpop_public_key").notNull(), // JWK format
  sessionId: text("session_id").unique(), // Session cookie ID
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Display names table - REMOVED in migration 007 as it was never used by any active code
// export const displayNameTable = sqliteTable("display_names", { ... });

// PDS tracking for distributed crawler - ACTIVE SYSTEM TABLE
export const userPdsesTable = sqliteTable("user_pdses", {
  pdsUrl: text("pds_url").primaryKey(), // PDS server URL
  userCount: integer("user_count").default(1), // Number of users on this PDS
  lastCrawledAt: text("last_crawled_at"), // When this PDS was last crawled
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`), // When first discovered
});

// Export types for use in queries
export type CheckinInsert = typeof checkinsTable.$inferInsert;
export type CheckinSelect = typeof checkinsTable.$inferSelect;
export type ProfileInsert = typeof profileCacheTable.$inferInsert;
export type ProfileSelect = typeof profileCacheTable.$inferSelect;
// AddressCache types removed - table was unused and deleted
export type UserFollowInsert = typeof userFollowsTable.$inferInsert;
export type UserFollowSelect = typeof userFollowsTable.$inferSelect;
export type AnchorUserInsert = typeof anchorUsersTable.$inferInsert;
export type AnchorUserSelect = typeof anchorUsersTable.$inferSelect;
export type OAuthSessionInsert = typeof oauthSessionsTable.$inferInsert;
export type OAuthSessionSelect = typeof oauthSessionsTable.$inferSelect;
export type UserPdsInsert = typeof userPdsesTable.$inferInsert;
export type UserPdsSelect = typeof userPdsesTable.$inferSelect;
