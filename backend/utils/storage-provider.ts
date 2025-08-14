// Storage provider interface for profile data
// Enables dependency injection and easy testing

export interface ProfileData {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  fetchedAt: string;
  updatedAt?: string;
}

export interface StorageProvider {
  getProfile(did: string): Promise<ProfileData | null>;
  setProfile(profile: ProfileData): Promise<void>;
  getStaleProfiles(
    limit: number,
    staleThresholdHours: number,
  ): Promise<ProfileData[]>;
  ensureTablesExist(): Promise<void>;
}

export class DrizzleStorageProvider implements StorageProvider {
  constructor(private db: any) {} // Drizzle db instance

  async getProfile(did: string): Promise<ProfileData | null> {
    const { profileCacheTable } = await import("../database/schema.ts");
    const { eq } = await import("https://esm.sh/drizzle-orm");

    const result = await this.db
      .select()
      .from(profileCacheTable)
      .where(eq(profileCacheTable.did, did))
      .limit(1);

    if (result.length > 0) {
      const row = result[0];
      return {
        did: row.did,
        handle: row.handle || "",
        displayName: row.displayName || undefined,
        avatar: row.avatarUrl || undefined,
        description: row.description || undefined,
        fetchedAt: row.indexedAt || "",
        updatedAt: row.updatedAt || undefined,
      };
    }

    return null;
  }

  async setProfile(profile: ProfileData): Promise<void> {
    const { profileCacheTable } = await import("../database/schema.ts");

    await this.db
      .insert(profileCacheTable)
      .values({
        did: profile.did,
        handle: profile.handle,
        displayName: profile.displayName || null,
        avatarUrl: profile.avatar || null,
        description: profile.description || null,
        indexedAt: profile.fetchedAt,
        updatedAt: profile.updatedAt || profile.fetchedAt,
      })
      .onConflictDoUpdate({
        target: profileCacheTable.did,
        set: {
          handle: profile.handle,
          displayName: profile.displayName || null,
          avatarUrl: profile.avatar || null,
          description: profile.description || null,
          updatedAt: profile.updatedAt || profile.fetchedAt,
        },
      });
  }

  async getStaleProfiles(
    limit: number,
    staleThresholdHours: number,
  ): Promise<ProfileData[]> {
    const { profileCacheTable } = await import("../database/schema.ts");
    const { lt } = await import("https://esm.sh/drizzle-orm");

    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - staleThresholdHours);

    const result = await this.db
      .select()
      .from(profileCacheTable)
      .where(lt(profileCacheTable.indexedAt, staleThreshold.toISOString()))
      .orderBy(profileCacheTable.indexedAt)
      .limit(limit);

    return result.map((row: any) => ({
      did: row.did,
      handle: row.handle || "",
      displayName: row.displayName || undefined,
      avatar: row.avatarUrl || undefined,
      description: row.description || undefined,
      fetchedAt: row.indexedAt || "",
      updatedAt: row.updatedAt || undefined,
    }));
  }

  ensureTablesExist(): Promise<void> {
    // Tables are created by migrations, so this is a no-op for Drizzle
    return Promise.resolve();
  }
}

// Legacy class for backward compatibility - DO NOT USE IN NEW CODE
export class SqliteStorageProvider implements StorageProvider {
  constructor(private sqlite: any) {
    console.warn(
      "⚠️ SqliteStorageProvider is deprecated. Use DrizzleStorageProvider instead.",
    );
  }

  async getProfile(did: string): Promise<ProfileData | null> {
    const result = await this.sqlite.execute({
      sql: "SELECT * FROM profile_cache WHERE did = ?",
      args: [did],
    });

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return {
        did: row.did as string,
        handle: row.handle as string,
        displayName: row.display_name as string | undefined,
        avatar: row.avatar_url as string | undefined,
        description: row.description as string | undefined,
        fetchedAt: row.indexed_at as string,
        updatedAt: row.updated_at as string | undefined,
      };
    }

    return null;
  }

  async setProfile(profile: ProfileData): Promise<void> {
    await this.sqlite.execute({
      sql: `INSERT OR REPLACE INTO profile_cache 
       (did, handle, display_name, avatar_url, description, indexed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        profile.did,
        profile.handle,
        profile.displayName || null,
        profile.avatar || null,
        profile.description || null,
        profile.fetchedAt,
        profile.updatedAt || profile.fetchedAt,
      ],
    });
  }

  async getStaleProfiles(
    limit: number,
    staleThresholdHours: number,
  ): Promise<ProfileData[]> {
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - staleThresholdHours);

    const result = await this.sqlite.execute({
      sql: `SELECT * FROM profile_cache 
       WHERE indexed_at < ? 
       ORDER BY indexed_at ASC 
       LIMIT ?`,
      args: [staleThreshold.toISOString(), limit],
    });

    return (result.rows || []).map((row) => ({
      did: row.did as string,
      handle: row.handle as string,
      displayName: row.display_name as string | undefined,
      avatar: row.avatar_url as string | undefined,
      description: row.description as string | undefined,
      fetchedAt: row.indexed_at as string,
      updatedAt: row.updated_at as string | undefined,
    }));
  }

  async ensureTablesExist(): Promise<void> {
    await this.sqlite.execute({
      sql: `CREATE TABLE IF NOT EXISTS profile_cache (
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
      )`,
      args: [],
    });

    await this.sqlite.execute({
      sql:
        `CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profile_cache(updated_at)`,
      args: [],
    });
    await this.sqlite.execute({
      sql:
        `CREATE INDEX IF NOT EXISTS idx_profiles_indexed ON profile_cache(indexed_at)`,
      args: [],
    });
  }
}

export class InMemoryStorageProvider implements StorageProvider {
  private profiles: Map<string, ProfileData> = new Map();

  getProfile(did: string): Promise<ProfileData | null> {
    return Promise.resolve(this.profiles.get(did) || null);
  }

  setProfile(profile: ProfileData): Promise<void> {
    this.profiles.set(profile.did, profile);
    return Promise.resolve();
  }

  getStaleProfiles(
    limit: number,
    staleThresholdHours: number,
  ): Promise<ProfileData[]> {
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - staleThresholdHours);

    return Promise.resolve(
      Array.from(this.profiles.values())
        .filter((profile) => new Date(profile.fetchedAt) < staleThreshold)
        .sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))
        .slice(0, limit),
    );
  }

  ensureTablesExist(): Promise<void> {
    // No-op for in-memory storage
    return Promise.resolve();
  }

  clear(): void {
    this.profiles.clear();
  }
}
