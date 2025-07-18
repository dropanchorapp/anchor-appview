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
  getStaleProfiles(limit: number, staleThresholdHours: number): Promise<ProfileData[]>;
  ensureTablesExist(): Promise<void>;
}

export class SqliteStorageProvider implements StorageProvider {
  constructor(private sqlite: any) {}

  async getProfile(did: string): Promise<ProfileData | null> {
    const result = await this.sqlite.execute(
      "SELECT * FROM profile_cache_v1 WHERE did = ?",
      [did]
    );

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return {
        did: row.did as string,
        handle: row.handle as string,
        displayName: row.display_name as string | undefined,
        avatar: row.avatar as string | undefined,
        description: row.description as string | undefined,
        fetchedAt: row.fetched_at as string,
        updatedAt: row.updated_at as string | undefined,
      };
    }

    return null;
  }

  async setProfile(profile: ProfileData): Promise<void> {
    await this.sqlite.execute(
      `INSERT OR REPLACE INTO profile_cache_v1 
       (did, handle, display_name, avatar, description, fetched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.did,
        profile.handle,
        profile.displayName || null,
        profile.avatar || null,
        profile.description || null,
        profile.fetchedAt,
        profile.updatedAt || profile.fetchedAt,
      ]
    );
  }

  async getStaleProfiles(limit: number, staleThresholdHours: number): Promise<ProfileData[]> {
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - staleThresholdHours);

    const result = await this.sqlite.execute(
      `SELECT * FROM profile_cache_v1 
       WHERE fetched_at < ? 
       ORDER BY fetched_at ASC 
       LIMIT ?`,
      [staleThreshold.toISOString(), limit]
    );

    return (result.rows || []).map((row: any) => ({
      did: row.did as string,
      handle: row.handle as string,
      displayName: row.display_name as string | undefined,
      avatar: row.avatar as string | undefined,
      description: row.description as string | undefined,
      fetchedAt: row.fetched_at as string,
      updatedAt: row.updated_at as string | undefined,
    }));
  }

  async ensureTablesExist(): Promise<void> {
    await this.sqlite.execute(`
      CREATE TABLE IF NOT EXISTS profile_cache_v1 (
        did TEXT PRIMARY KEY,
        handle TEXT NOT NULL,
        display_name TEXT,
        avatar TEXT,
        description TEXT,
        fetched_at TEXT NOT NULL,
        updated_at TEXT,
        full_data JSON
      )
    `);

    await this.sqlite.execute(
      `CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profile_cache_v1(updated_at)`
    );
    await this.sqlite.execute(
      `CREATE INDEX IF NOT EXISTS idx_profiles_fetched ON profile_cache_v1(fetched_at)`
    );
  }
}

export class InMemoryStorageProvider implements StorageProvider {
  private profiles: Map<string, ProfileData> = new Map();

  async getProfile(did: string): Promise<ProfileData | null> {
    return this.profiles.get(did) || null;
  }

  async setProfile(profile: ProfileData): Promise<void> {
    this.profiles.set(profile.did, profile);
  }

  async getStaleProfiles(limit: number, staleThresholdHours: number): Promise<ProfileData[]> {
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - staleThresholdHours);

    return Array.from(this.profiles.values())
      .filter(profile => new Date(profile.fetchedAt) < staleThreshold)
      .sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))
      .slice(0, limit);
  }

  async ensureTablesExist(): Promise<void> {
    // No-op for in-memory storage
  }

  clear(): void {
    this.profiles.clear();
  }
}