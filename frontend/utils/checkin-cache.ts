/**
 * Browser-side caching for checkins using IndexedDB
 *
 * Implements stale-while-revalidate pattern:
 * - Returns cached data immediately if fresh enough
 * - Background refreshes if cache is getting stale
 * - Full refresh if cache expired
 */

import { IDBPDatabase, openDB } from "https://esm.sh/idb@8.0.0";
import type { CheckinData } from "../types/index.ts";

// Cache configuration
const DB_NAME = "anchor-cache";
const DB_VERSION = 1;
const CACHE_VERSION = 1;

// Cache timing (in milliseconds)
// Cache doesn't expire based on time - only invalidation events (new checkin, delete, logout)
// Background revalidation happens after REVALIDATE threshold to ensure freshness
const CACHE_REVALIDATE_MS = 2 * 60 * 1000; // 2 minutes - background refresh after this

// Store names
const FEEDS_STORE = "feeds";

interface CachedFeed {
  checkins: CheckinData[];
  timestamp: number;
  version: number;
}

interface FeedStore {
  key: string;
  value: CachedFeed;
}

type AnchorCacheDB = {
  [FEEDS_STORE]: FeedStore;
};

/**
 * Service for caching checkin feeds in IndexedDB
 */
class CheckinCacheService {
  private db: IDBPDatabase<AnchorCacheDB> | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  init(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.db) {
      return Promise.resolve();
    }

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      // deno-lint-ignore no-explicit-any
      this.db = await openDB<any>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create feeds store if it doesn't exist
          if (!db.objectStoreNames.contains(FEEDS_STORE)) {
            db.createObjectStore(FEEDS_STORE);
          }
        },
      });
    } catch (error) {
      console.warn("Failed to initialize IndexedDB cache:", error);
      // Cache is optional - app works without it
      this.db = null;
    }
  }

  /**
   * Get cached feed for a user
   */
  async getFeed(userDid: string): Promise<CachedFeed | null> {
    await this.init();
    if (!this.db) return null;

    try {
      const key = `feed:${userDid}`;
      const cached = await this.db.get(FEEDS_STORE, key);

      if (!cached) return null;

      // Check cache version - invalidate if schema changed
      if (cached.version !== CACHE_VERSION) {
        await this.db.delete(FEEDS_STORE, key);
        return null;
      }

      return cached;
    } catch (error) {
      console.warn("Failed to read from cache:", error);
      return null;
    }
  }

  /**
   * Store feed in cache
   */
  async setFeed(userDid: string, checkins: CheckinData[]): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const key = `feed:${userDid}`;
      const entry: CachedFeed = {
        checkins,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      };
      await this.db.put(FEEDS_STORE, entry, key);
    } catch (error) {
      console.warn("Failed to write to cache:", error);
    }
  }

  /**
   * Invalidate (delete) cached feed
   */
  async invalidateFeed(userDid: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const key = `feed:${userDid}`;
      await this.db.delete(FEEDS_STORE, key);
    } catch (error) {
      console.warn("Failed to invalidate cache:", error);
    }
  }

  /**
   * Prepend a new checkin to the cached feed
   * Used after creating a new checkin for instant feedback
   */
  async prependCheckin(userDid: string, checkin: CheckinData): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const cached = await this.getFeed(userDid);
      if (!cached) return;

      // Prepend new checkin and update timestamp
      const updatedCheckins = [checkin, ...cached.checkins];
      await this.setFeed(userDid, updatedCheckins);
    } catch (error) {
      console.warn("Failed to prepend checkin to cache:", error);
    }
  }

  /**
   * Remove a checkin from the cached feed
   * Used after deleting a checkin
   */
  async removeCheckin(userDid: string, checkinUri: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const cached = await this.getFeed(userDid);
      if (!cached) return;

      const updatedCheckins = cached.checkins.filter(
        (c) => c.uri !== checkinUri,
      );
      await this.setFeed(userDid, updatedCheckins);
    } catch (error) {
      console.warn("Failed to remove checkin from cache:", error);
    }
  }

  /**
   * Update like count for a checkin in the cache
   */
  async updateCheckinLikes(
    userDid: string,
    checkinUri: string,
    likesCount: number,
  ): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const cached = await this.getFeed(userDid);
      if (!cached) return;

      const updatedCheckins = cached.checkins.map((c) =>
        c.uri === checkinUri ? { ...c, likesCount } : c
      );
      await this.setFeed(userDid, updatedCheckins);
    } catch (error) {
      console.warn("Failed to update checkin likes in cache:", error);
    }
  }

  /**
   * Clear all cached data for a user
   * Used on logout
   */
  async clearAll(userDid: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    try {
      const key = `feed:${userDid}`;
      await this.db.delete(FEEDS_STORE, key);
    } catch (error) {
      console.warn("Failed to clear cache:", error);
    }
  }

  /**
   * Check if cached data is still valid
   * Cache doesn't expire based on time - only invalidation events
   */
  isCacheValid(_timestamp: number): boolean {
    // Cache is always valid until explicitly invalidated
    return true;
  }

  /**
   * Check if cached data needs background revalidation
   * This ensures we periodically refresh to catch external changes
   */
  needsRevalidation(timestamp: number): boolean {
    return Date.now() - timestamp > CACHE_REVALIDATE_MS;
  }
}

// Export singleton instance
export const checkinCache = new CheckinCacheService();
