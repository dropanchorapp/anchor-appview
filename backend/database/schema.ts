// Drizzle schema definitions for Anchor AppView database
// This provides type safety and prevents field name mismatches

import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "https://esm.sh/drizzle-orm@0.44.5/sqlite-core";

// No local data tables needed - all checkin data read directly from PDS
// Only OAuth session storage required for authentication

// Iron Session storage for encrypted session cookies
export const ironSessionStorageTable = sqliteTable("iron_session_storage", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Index table for efficient likes and comments discovery
// Stores individual interactions (likes and comments) for fast lookup
export const checkinInteractionsTable = sqliteTable("checkin_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Checkin being interacted with
  checkinDid: text("checkin_did").notNull(),
  checkinRkey: text("checkin_rkey").notNull(),
  checkinUri: text("checkin_uri").notNull(), // Full AT URI for the checkin

  // Author of the interaction (liker/commenter)
  authorDid: text("author_did").notNull(),
  authorHandle: text("author_handle"),
  authorDisplayName: text("author_display_name"),
  authorAvatar: text("author_avatar"),

  // Type of interaction
  interactionType: text("interaction_type").notNull(), // 'like' or 'comment'

  // Interaction record details
  interactionUri: text("interaction_uri").notNull(), // Full AT URI of the like/comment record
  interactionRkey: text("interaction_rkey").notNull(),
  interactionCid: text("interaction_cid").notNull(),

  // Comment-specific fields (null for likes)
  commentText: text("comment_text"),

  // Timestamps
  createdAt: text("created_at").notNull(),
  indexedAt: text("indexed_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
}, (table) => ({
  // Index for fast lookup of interactions by checkin (unique - one user can only like/comment once per checkin)
  checkinIndex: uniqueIndex("idx_checkin_interactions_checkin").on(
    table.checkinDid,
    table.checkinRkey,
    table.authorDid,
    table.interactionType,
  ),
  // Index for fast lookup by interaction type (non-unique - multiple users can have same type)
  typeIndex: index("idx_checkin_interactions_type").on(
    table.interactionType,
    table.createdAt,
  ),
  // Index for fast lookup by author (non-unique - authors can have multiple interactions)
  authorIndex: index("idx_checkin_interactions_author").on(
    table.authorDid,
    table.createdAt,
  ),
}));

// Counts table for efficient aggregation queries
// Stores pre-computed counts for each checkin to avoid expensive joins
export const checkinCountsTable = sqliteTable("checkin_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Checkin being counted
  checkinDid: text("checkin_did").notNull(),
  checkinRkey: text("checkin_rkey").notNull(),
  checkinUri: text("checkin_uri").notNull(),

  // Counts
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),

  // Last interaction timestamps for sorting
  lastLikeAt: text("last_like_at"),
  lastCommentAt: text("last_comment_at"),

  // Metadata
  indexedAt: text("indexed_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
}, (table) => ({
  // Unique index for the checkin being counted
  checkinCountIndex: uniqueIndex("idx_checkin_counts_checkin").on(
    table.checkinDid,
    table.checkinRkey,
  ),
}));

// Export types for OAuth session storage
export type IronSessionInsert = typeof ironSessionStorageTable.$inferInsert;
export type IronSessionSelect = typeof ironSessionStorageTable.$inferSelect;

// Export types for index tables
export type CheckinInteractionInsert =
  typeof checkinInteractionsTable.$inferInsert;
export type CheckinInteractionSelect =
  typeof checkinInteractionsTable.$inferSelect;
export type CheckinCountInsert = typeof checkinCountsTable.$inferInsert;
export type CheckinCountSelect = typeof checkinCountsTable.$inferSelect;
