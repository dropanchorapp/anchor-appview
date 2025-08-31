// Simple Val.town-compatible storage for OAuth client
// Uses Drizzle ORM for type safety and consistency

import { db } from "../database/db.ts";
import { ironSessionStorageTable } from "../database/schema.ts";
import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  or,
} from "https://esm.sh/drizzle-orm";

// Simple storage interface that works with OAuth client
export class ValTownStorage {
  private initialized = false;

  init() {
    if (this.initialized) return;
    // Table creation is handled by Drizzle migrations (012_iron_session_storage)
    this.initialized = true;
  }

  async hasItem(key: string): Promise<boolean> {
    this.init();

    const now = Date.now();
    const result = await db.select({ key: ironSessionStorageTable.key })
      .from(ironSessionStorageTable)
      .where(
        and(
          eq(ironSessionStorageTable.key, key),
          // Either no expiration (null) or expires in the future
          or(
            isNull(ironSessionStorageTable.expiresAt),
            gt(ironSessionStorageTable.expiresAt, now),
          ),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  async getItem<T = any>(key: string): Promise<T | null> {
    this.init();

    const now = Date.now();
    const result = await db.select({ value: ironSessionStorageTable.value })
      .from(ironSessionStorageTable)
      .where(
        and(
          eq(ironSessionStorageTable.key, key),
          // Either no expiration (null) or expires in the future
          or(
            isNull(ironSessionStorageTable.expiresAt),
            gt(ironSessionStorageTable.expiresAt, now),
          ),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    try {
      const value = result[0].value;
      return JSON.parse(value) as T;
    } catch {
      return result[0].value as T;
    }
  }

  async setItem(
    key: string,
    value: any,
    options?: { ttl?: number },
  ): Promise<void> {
    this.init();

    const now = Date.now();
    const expiresAt = options?.ttl ? now + (options.ttl * 1000) : null;
    const serializedValue = typeof value === "string"
      ? value
      : JSON.stringify(value);

    await db.insert(ironSessionStorageTable)
      .values({
        key,
        value: serializedValue,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: ironSessionStorageTable.key,
        set: {
          value: serializedValue,
          expiresAt,
          updatedAt: now,
        },
      });
  }

  async removeItem(key: string): Promise<void> {
    this.init();

    await db.delete(ironSessionStorageTable)
      .where(eq(ironSessionStorageTable.key, key));
  }

  async getKeys(): Promise<string[]> {
    this.init();

    const now = Date.now();
    const result = await db.select({ key: ironSessionStorageTable.key })
      .from(ironSessionStorageTable)
      .where(
        // Either no expiration (null) or expires in the future
        or(
          isNull(ironSessionStorageTable.expiresAt),
          gt(ironSessionStorageTable.expiresAt, now),
        ),
      );

    return result.map((row) => row.key);
  }

  async clear(): Promise<void> {
    this.init();

    await db.delete(ironSessionStorageTable);
  }

  // Cleanup expired entries
  async cleanup(): Promise<void> {
    this.init();

    const now = Date.now();
    await db.delete(ironSessionStorageTable)
      .where(
        and(
          // Has an expiration time (not null)
          isNotNull(ironSessionStorageTable.expiresAt),
          // And is expired (less than or equal to now)
          lte(ironSessionStorageTable.expiresAt, now),
        ),
      );
  }

  // Aliases for OAuth client compatibility
  get = this.getItem;
  set = this.setItem;
  del = this.removeItem;
  delete = this.removeItem;
}

// Create singleton instance
export const valTownStorage = new ValTownStorage();
