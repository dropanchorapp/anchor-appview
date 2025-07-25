import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  InMemoryStorageProvider,
  ProfileData,
} from "../../src/utils/storage-provider.ts";

import {
  ATProtocolProfileResolver,
  MockProfileFetcher,
} from "../../src/utils/profile-resolver-v2.ts";

Deno.test("Profile Resolver v2 - resolveProfile with cache hit", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Pre-populate cache with fresh profile
  const cachedProfile: ProfileData = {
    did: "did:plc:cached",
    handle: "cached.bsky.social",
    displayName: "Cached User",
    avatar: "https://example.com/avatar.jpg",
    description: "Test user",
    fetchedAt: new Date().toISOString(), // Fresh
    updatedAt: new Date().toISOString(),
  };

  await storage.setProfile(cachedProfile);

  // Should return cached profile without fetching
  const result = await resolver.resolveProfile("did:plc:cached");

  assertExists(result);
  assertEquals(result.handle, "cached.bsky.social");
  assertEquals(result.displayName, "Cached User");
});

Deno.test("Profile Resolver v2 - resolveProfile with cache miss", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Set up mock profile
  fetcher.setMockProfile("did:plc:fresh", {
    handle: "fresh.bsky.social",
    displayName: "Fresh User",
    avatar: "https://example.com/fresh.jpg",
  });

  // Should fetch and cache profile
  const result = await resolver.resolveProfile("did:plc:fresh");

  assertExists(result);
  assertEquals(result.handle, "fresh.bsky.social");
  assertEquals(result.displayName, "Fresh User");
  assertEquals(result.avatar, "https://example.com/fresh.jpg");

  // Should now be cached
  const cached = await storage.getProfile("did:plc:fresh");
  assertExists(cached);
  assertEquals(cached.handle, "fresh.bsky.social");
});

Deno.test("Profile Resolver v2 - resolveProfile with stale cache", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Pre-populate cache with stale profile (25 hours ago)
  const staleDate = new Date();
  staleDate.setHours(staleDate.getHours() - 25);

  const staleProfile: ProfileData = {
    did: "did:plc:stale",
    handle: "old.bsky.social",
    displayName: "Old Name",
    fetchedAt: staleDate.toISOString(),
    updatedAt: staleDate.toISOString(),
  };

  await storage.setProfile(staleProfile);

  // Set up fresh mock profile
  fetcher.setMockProfile("did:plc:stale", {
    handle: "updated.bsky.social",
    displayName: "Updated Name",
    avatar: "https://example.com/updated.jpg",
  });

  // Should fetch fresh profile
  const result = await resolver.resolveProfile("did:plc:stale");

  assertExists(result);
  assertEquals(result.handle, "updated.bsky.social");
  assertEquals(result.displayName, "Updated Name");
  assertEquals(result.avatar, "https://example.com/updated.jpg");
});

Deno.test("Profile Resolver v2 - batchResolveProfiles with mixed cache", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Pre-populate cache with one profile
  const cachedProfile: ProfileData = {
    did: "did:plc:cached",
    handle: "cached.bsky.social",
    displayName: "Cached User",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await storage.setProfile(cachedProfile);

  // Set up mock for uncached profile
  fetcher.setMockProfile("did:plc:fresh", {
    handle: "fresh.bsky.social",
    displayName: "Fresh User",
  });

  // Batch resolve both profiles
  const results = await resolver.batchResolveProfiles([
    "did:plc:cached",
    "did:plc:fresh",
  ]);

  assertEquals(results.size, 2);

  // Check cached profile
  const cached = results.get("did:plc:cached");
  assertExists(cached);
  assertEquals(cached.displayName, "Cached User");

  // Check fresh profile
  const fresh = results.get("did:plc:fresh");
  assertExists(fresh);
  assertEquals(fresh.displayName, "Fresh User");
});

Deno.test("Profile Resolver v2 - refreshStaleProfiles", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Add stale profiles
  const staleDate = new Date();
  staleDate.setHours(staleDate.getHours() - 25);

  const staleProfile1: ProfileData = {
    did: "did:plc:stale1",
    handle: "stale1.bsky.social",
    displayName: "Stale 1",
    fetchedAt: staleDate.toISOString(),
    updatedAt: staleDate.toISOString(),
  };

  const staleProfile2: ProfileData = {
    did: "did:plc:stale2",
    handle: "stale2.bsky.social",
    displayName: "Stale 2",
    fetchedAt: staleDate.toISOString(),
    updatedAt: staleDate.toISOString(),
  };

  await storage.setProfile(staleProfile1);
  await storage.setProfile(staleProfile2);

  // Set up fresh mock profiles
  fetcher.setMockProfile("did:plc:stale1", {
    handle: "updated1.bsky.social",
    displayName: "Updated 1",
  });

  fetcher.setMockProfile("did:plc:stale2", {
    handle: "updated2.bsky.social",
    displayName: "Updated 2",
  });

  // Refresh stale profiles
  const refreshedCount = await resolver.refreshStaleProfiles(10);

  assertEquals(refreshedCount, 2);

  // Check profiles were updated
  const updated1 = await storage.getProfile("did:plc:stale1");
  const updated2 = await storage.getProfile("did:plc:stale2");

  assertExists(updated1);
  assertExists(updated2);
  assertEquals(updated1.displayName, "Updated 1");
  assertEquals(updated2.displayName, "Updated 2");
});

Deno.test("Profile Resolver v2 - handles fetch failures gracefully", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher(); // No mock profiles set up
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Should return null for unknown profile
  const result = await resolver.resolveProfile("did:plc:unknown");

  assertEquals(result, null);
});

Deno.test("Profile Resolver v2 - returns stale cache on fetch failure", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher(); // No mock profiles set up
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Pre-populate cache with stale profile
  const staleDate = new Date();
  staleDate.setHours(staleDate.getHours() - 25);

  const staleProfile: ProfileData = {
    did: "did:plc:stale",
    handle: "stale.bsky.social",
    displayName: "Stale User",
    fetchedAt: staleDate.toISOString(),
    updatedAt: staleDate.toISOString(),
  };

  await storage.setProfile(staleProfile);

  // Should return stale cache when fetch fails
  const result = await resolver.resolveProfile("did:plc:stale");

  assertExists(result);
  assertEquals(result.handle, "stale.bsky.social");
  assertEquals(result.displayName, "Stale User");
});

Deno.test("Profile Resolver v2 - batch processing with rate limiting", async () => {
  const storage = new InMemoryStorageProvider();
  const fetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, fetcher);

  // Set up mock profiles
  const dids = Array.from({ length: 12 }, (_, i) => `did:plc:user${i}`);

  for (const did of dids) {
    fetcher.setMockProfile(did, {
      handle: `user${did.slice(-1)}.bsky.social`,
      displayName: `User ${did.slice(-1)}`,
    });
  }

  const startTime = Date.now();

  // Should process in batches with delays
  const results = await resolver.batchResolveProfiles(dids);

  const duration = Date.now() - startTime;

  // Should have resolved all profiles
  assertEquals(results.size, 12);

  // Should have taken some time due to rate limiting
  // (3 batches - 1 delay = 2 delays of 500ms each = ~1000ms minimum)
  assertEquals(duration >= 1000, true);
});
