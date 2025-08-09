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

export class SqliteStorageProvider implements StorageProvider {
  constructor(private sqlite: any) {}

  async getProfile(did: string): Promise<ProfileData | null> {
    const result = await this.sqlite.execute(
      "SELECT * FROM profile_cache WHERE did = ?",
      [did],
    );

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
    await this.sqlite.execute(
      `INSERT OR REPLACE INTO profile_cache 
       (did, handle, display_name, avatar_url, description, indexed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.did,
        profile.handle,
        profile.displayName || null,
        profile.avatar || null,
        profile.description || null,
        profile.fetchedAt,
        profile.updatedAt || profile.fetchedAt,
      ],
    );
  }

  async getStaleProfiles(
    limit: number,
    staleThresholdHours: number,
  ): Promise<ProfileData[]> {
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - staleThresholdHours);

    const result = await this.sqlite.execute(
      `SELECT * FROM profile_cache 
       WHERE indexed_at < ? 
       ORDER BY indexed_at ASC 
       LIMIT ?`,
      [staleThreshold.toISOString(), limit],
    );

    return (result.rows || []).map((row: any) => ({
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
    await this.sqlite.execute(`
      CREATE TABLE IF NOT EXISTS profile_cache (
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
      )
    `);

    await this.sqlite.execute(
      `CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profile_cache(updated_at)`,
    );
    await this.sqlite.execute(
      `CREATE INDEX IF NOT EXISTS idx_profiles_indexed ON profile_cache(indexed_at)`,
    );
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
