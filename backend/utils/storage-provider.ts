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

  getProfile(_did: string): Promise<ProfileData | null> {
    // PDS-only mode - no profile caching
    return Promise.resolve(null);
  }

  setProfile(_profile: ProfileData): Promise<void> {
    // PDS-only mode - no profile caching
    return Promise.resolve();
  }

  getStaleProfiles(
    _limit: number,
    _staleThresholdHours: number,
  ): Promise<ProfileData[]> {
    // PDS-only mode - no profile caching
    return Promise.resolve([]);
  }

  ensureTablesExist(): Promise<void> {
    // PDS-only mode - no tables needed
    return Promise.resolve();
  }
}

// In-memory storage for testing
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
