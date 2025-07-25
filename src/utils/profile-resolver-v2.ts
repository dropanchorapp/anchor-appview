// Profile resolution utilities for AT Protocol
// Clean architecture with dependency injection for testing

import { ProfileData, StorageProvider } from "./storage-provider.ts";

export interface ProfileResolver {
  resolveProfile(did: string): Promise<ProfileData | null>;
  batchResolveProfiles(dids: string[]): Promise<Map<string, ProfileData>>;
  refreshStaleProfiles(limit?: number): Promise<number>;
}

export class ATProtocolProfileResolver implements ProfileResolver {
  private static readonly CACHE_TTL_HOURS = 24;
  private static readonly BATCH_SIZE = 5;
  private static readonly BATCH_DELAY_MS = 500;

  constructor(
    private storage: StorageProvider,
    private fetcher: ProfileFetcher = new BlueskyProfileFetcher(),
  ) {}

  async resolveProfile(did: string): Promise<ProfileData | null> {
    // Check cache first
    const cached = await this.storage.getProfile(did);
    if (cached && !this.isStale(cached)) {
      return cached;
    }

    // Fetch fresh profile
    try {
      const profile = await this.fetcher.fetchProfile(did);
      if (profile) {
        await this.storage.setProfile(profile);
        return profile;
      }
    } catch (error) {
      console.error(`Failed to resolve profile for ${did}:`, error);
    }

    // Return stale cache if available
    return cached;
  }

  async batchResolveProfiles(
    dids: string[],
  ): Promise<Map<string, ProfileData>> {
    const results = new Map<string, ProfileData>();
    const didsToFetch: string[] = [];

    // Check cache for all DIDs
    for (const did of dids) {
      const cached = await this.storage.getProfile(did);
      if (cached && !this.isStale(cached)) {
        results.set(did, cached);
      } else {
        didsToFetch.push(did);
      }
    }

    // Batch fetch missing/stale profiles
    if (didsToFetch.length > 0) {
      await this.batchFetchProfiles(didsToFetch, results);
    }

    return results;
  }

  async refreshStaleProfiles(limit: number = 50): Promise<number> {
    const staleProfiles = await this.storage.getStaleProfiles(
      limit,
      ATProtocolProfileResolver.CACHE_TTL_HOURS,
    );

    if (staleProfiles.length === 0) {
      return 0;
    }

    const dids = staleProfiles.map((p) => p.did);
    const refreshed = await this.batchResolveProfiles(dids);

    return refreshed.size;
  }

  private isStale(profile: ProfileData): boolean {
    const fetchedAt = new Date(profile.fetchedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
    return hoursDiff > ATProtocolProfileResolver.CACHE_TTL_HOURS;
  }

  private async batchFetchProfiles(
    dids: string[],
    results: Map<string, ProfileData>,
  ): Promise<void> {
    const batches = this.createBatches(
      dids,
      ATProtocolProfileResolver.BATCH_SIZE,
    );

    for (const [index, batch] of batches.entries()) {
      const promises = batch.map(async (did) => {
        try {
          const profile = await this.fetcher.fetchProfile(did);
          if (profile) {
            await this.storage.setProfile(profile);
            results.set(did, profile);
          }
        } catch (error) {
          console.error(`Failed to fetch profile for ${did}:`, error);
        }
      });

      await Promise.all(promises);

      // Rate limit between batches
      if (index < batches.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, ATProtocolProfileResolver.BATCH_DELAY_MS)
        );
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

export interface ProfileFetcher {
  fetchProfile(did: string): Promise<ProfileData | null>;
}

export class BlueskyProfileFetcher implements ProfileFetcher {
  async fetchProfile(did: string): Promise<ProfileData | null> {
    try {
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`,
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const now = new Date().toISOString();

      return {
        did: data.did,
        handle: data.handle,
        displayName: data.displayName || undefined,
        avatar: data.avatar || undefined,
        description: data.description || undefined,
        fetchedAt: now,
        updatedAt: now,
      };
    } catch (error) {
      console.error(`Failed to fetch profile for ${did}:`, error);
      return null;
    }
  }
}

export class MockProfileFetcher implements ProfileFetcher {
  constructor(
    private mockProfiles: Map<string, Partial<ProfileData>> = new Map(),
  ) {}

  fetchProfile(did: string): Promise<ProfileData | null> {
    const mock = this.mockProfiles.get(did);
    if (!mock) return Promise.resolve(null);

    const now = new Date().toISOString();
    return Promise.resolve({
      did,
      handle: mock.handle || `${did.slice(-6)}.bsky.social`,
      displayName: mock.displayName,
      avatar: mock.avatar,
      description: mock.description,
      fetchedAt: now,
      updatedAt: now,
    });
  }

  setMockProfile(did: string, profile: Partial<ProfileData>): void {
    this.mockProfiles.set(did, profile);
  }
}
