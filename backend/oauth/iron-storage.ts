// Simple Val.town-compatible storage for OAuth client
// Uses SQLite for state/session storage

import { sqlite } from "https://esm.town/v/std/sqlite2";

// Simple storage interface that works with OAuth client
export class ValTownStorage {
  private initialized = false;

  async init() {
    if (this.initialized) return;

    // Initialize storage table for Iron Session data
    await sqlite.execute({
      sql: `CREATE TABLE IF NOT EXISTS iron_session_storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      args: [],
    });

    // Create index for efficient cleanup
    await sqlite.execute({
      sql: `CREATE INDEX IF NOT EXISTS idx_iron_session_expires 
            ON iron_session_storage(expires_at)`,
      args: [],
    });

    this.initialized = true;
  }

  async hasItem(key: string): Promise<boolean> {
    await this.init();

    const result = await sqlite.execute({
      sql: `SELECT 1 FROM iron_session_storage 
            WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      args: [key, Date.now()],
    });

    return result.rows.length > 0;
  }

  async getItem<T = any>(key: string): Promise<T | null> {
    await this.init();

    const result = await sqlite.execute({
      sql: `SELECT value FROM iron_session_storage 
            WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      args: [key, Date.now()],
    });

    if (result.rows.length === 0) {
      return null;
    }

    try {
      const value = result.rows[0][0] as string;
      return JSON.parse(value) as T;
    } catch {
      return result.rows[0][0] as T;
    }
  }

  async setItem(
    key: string,
    value: any,
    options?: { ttl?: number },
  ): Promise<void> {
    await this.init();

    const now = Date.now();
    const expiresAt = options?.ttl ? now + (options.ttl * 1000) : null;
    const serializedValue = typeof value === "string"
      ? value
      : JSON.stringify(value);

    await sqlite.execute({
      sql: `INSERT OR REPLACE INTO iron_session_storage 
            (key, value, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [key, serializedValue, expiresAt, now, now],
    });
  }

  async removeItem(key: string): Promise<void> {
    await this.init();

    await sqlite.execute({
      sql: `DELETE FROM iron_session_storage WHERE key = ?`,
      args: [key],
    });
  }

  async getKeys(): Promise<string[]> {
    await this.init();

    const result = await sqlite.execute({
      sql: `SELECT key FROM iron_session_storage 
            WHERE expires_at IS NULL OR expires_at > ?`,
      args: [Date.now()],
    });

    return result.rows.map((row) => row[0] as string);
  }

  async clear(): Promise<void> {
    await this.init();

    await sqlite.execute({
      sql: `DELETE FROM iron_session_storage`,
      args: [],
    });
  }

  // Cleanup expired entries
  async cleanup(): Promise<void> {
    await this.init();

    const now = Date.now();
    await sqlite.execute({
      sql:
        `DELETE FROM iron_session_storage WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      args: [now],
    });
  }

  // Aliases for OAuth client compatibility
  get = this.getItem;
  set = this.setItem;
  del = this.removeItem;
}

// Create singleton instance
export const valTownStorage = new ValTownStorage();
