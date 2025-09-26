/**
 * Storage adapter using Drizzle ORM for @tijs/atproto-oauth-hono
 */

import { DrizzleStorage } from "jsr:@tijs/atproto-oauth-hono@^0.2.6/drizzle";
import { db } from "../database/db.ts";

// Create singleton instance using Drizzle storage with our database
export const storage = new DrizzleStorage(db);
