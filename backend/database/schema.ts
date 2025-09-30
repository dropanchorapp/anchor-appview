// Drizzle schema definitions for Anchor AppView database
// This provides type safety and prevents field name mismatches

import {
  integer,
  sqliteTable,
  text,
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

// Export types for OAuth session storage only
export type IronSessionInsert = typeof ironSessionStorageTable.$inferInsert;
export type IronSessionSelect = typeof ironSessionStorageTable.$inferSelect;
