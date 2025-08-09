import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  ATProtocolProfileResolver,
  MockProfileFetcher,
} from "../../backend/utils/profile-resolver.ts";
import { InMemoryStorageProvider } from "../../backend/utils/storage-provider.ts";

Deno.test("ProfileResolver - resolveProfile with cache hit", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  // Pre-populate cache
  const did = "did:plc:test123";
  const cachedProfile = {
    did,
    handle: "test.bsky.social",
    displayName: "Test User",
    fetchedAt: new Date().toISOString(),
  };
  await storage.setProfile(cachedProfile);

  const result = await resolver.resolveProfile(did);
  assertExists(result);
  assertEquals(result.did, did);
  assertEquals(result.handle, "test.bsky.social");
  assertEquals(result.displayName, "Test User");
});

Deno.test("ProfileResolver - resolveProfile with cache miss", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  const did = "did:plc:test456";
  mockFetcher.setMockProfile(did, {
    handle: "newuser.bsky.social",
    displayName: "New User",
  });

  const result = await resolver.resolveProfile(did);
  assertExists(result);
  assertEquals(result.did, did);
  assertEquals(result.handle, "newuser.bsky.social");
  assertEquals(result.displayName, "New User");

  // Verify it was cached
  const cached = await storage.getProfile(did);
  assertExists(cached);
  assertEquals(cached.did, did);
});

Deno.test("ProfileResolver - resolveProfile with stale cache", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  const did = "did:plc:stale123";

  // Add stale cache entry (25+ hours ago)
  const staleDate = new Date();
  staleDate.setHours(staleDate.getHours() - 25);
  const staleProfile = {
    did,
    handle: "oldhandle.bsky.social",
    displayName: "Old Name",
    fetchedAt: staleDate.toISOString(),
  };
  await storage.setProfile(staleProfile);

  // Set up fresh data
  mockFetcher.setMockProfile(did, {
    handle: "newhandle.bsky.social",
    displayName: "New Name",
  });

  const result = await resolver.resolveProfile(did);
  assertExists(result);
  assertEquals(result.handle, "newhandle.bsky.social");
  assertEquals(result.displayName, "New Name");
});

Deno.test("ProfileResolver - batchResolveProfiles", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  const dids = ["did:plc:batch1", "did:plc:batch2", "did:plc:batch3"];

  // Pre-cache one profile
  await storage.setProfile({
    did: dids[0],
    handle: "cached.bsky.social",
    displayName: "Cached User",
    fetchedAt: new Date().toISOString(),
  });

  // Set up mock data for the others
  mockFetcher.setMockProfile(dids[1], {
    handle: "user2.bsky.social",
    displayName: "User 2",
  });
  mockFetcher.setMockProfile(dids[2], {
    handle: "user3.bsky.social",
    displayName: "User 3",
  });

  const results = await resolver.batchResolveProfiles(dids);
  assertEquals(results.size, 3);
  assertEquals(results.get(dids[0])?.handle, "cached.bsky.social");
  assertEquals(results.get(dids[1])?.handle, "user2.bsky.social");
  assertEquals(results.get(dids[2])?.handle, "user3.bsky.social");
});

Deno.test("ProfileResolver - refreshStaleProfiles", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  const dids = ["did:plc:refresh1", "did:plc:refresh2"];

  // Add stale profiles
  const staleDate = new Date();
  staleDate.setHours(staleDate.getHours() - 25);

  for (const did of dids) {
    await storage.setProfile({
      did,
      handle: `old-${did.slice(-6)}.bsky.social`,
      displayName: "Old Name",
      fetchedAt: staleDate.toISOString(),
    });

    mockFetcher.setMockProfile(did, {
      handle: `new-${did.slice(-6)}.bsky.social`,
      displayName: "New Name",
    });
  }

  const refreshed = await resolver.refreshStaleProfiles(10);
  assertEquals(refreshed, 2);

  // Verify profiles were updated
  for (const did of dids) {
    const profile = await storage.getProfile(did);
    assertExists(profile);
    assertEquals(profile.handle.startsWith("new-"), true);
    assertEquals(profile.displayName, "New Name");
  }
});

Deno.test("ProfileResolver - handles fetch failures gracefully", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  const did = "did:plc:missing";

  // Don't set up any mock data, so fetch will return null

  const result = await resolver.resolveProfile(did);
  assertEquals(result, null);
});

Deno.test("ProfileResolver - returns stale cache on fetch failure", async () => {
  const storage = new InMemoryStorageProvider();
  const mockFetcher = new MockProfileFetcher();
  const resolver = new ATProtocolProfileResolver(storage, mockFetcher);

  const did = "did:plc:fallback";

  // Add stale cache
  const staleDate = new Date();
  staleDate.setHours(staleDate.getHours() - 25);
  const staleProfile = {
    did,
    handle: "stale.bsky.social",
    displayName: "Stale User",
    fetchedAt: staleDate.toISOString(),
  };
  await storage.setProfile(staleProfile);

  // Don't set up fresh data, so fetch will fail

  const result = await resolver.resolveProfile(did);
  assertExists(result);
  assertEquals(result.handle, "stale.bsky.social");
  assertEquals(result.displayName, "Stale User");
});

Deno.test("MockProfileFetcher - basic functionality", async () => {
  const mockFetcher = new MockProfileFetcher();
  const did = "did:plc:mock123";

  mockFetcher.setMockProfile(did, {
    handle: "mock.bsky.social",
    displayName: "Mock User",
    avatar: "https://example.com/avatar.jpg",
  });

  const result = await mockFetcher.fetchProfile(did);
  assertExists(result);
  assertEquals(result.did, did);
  assertEquals(result.handle, "mock.bsky.social");
  assertEquals(result.displayName, "Mock User");
  assertEquals(result.avatar, "https://example.com/avatar.jpg");
  assertExists(result.fetchedAt);
});

Deno.test("MockProfileFetcher - generates handle if not provided", async () => {
  const mockFetcher = new MockProfileFetcher();
  const did = "did:plc:auto123456";

  mockFetcher.setMockProfile(did, {
    displayName: "Auto Handle",
  });

  const result = await mockFetcher.fetchProfile(did);
  assertExists(result);
  assertEquals(result.handle, "123456.bsky.social");
});

Deno.test("MockProfileFetcher - returns null for unknown DIDs", async () => {
  const mockFetcher = new MockProfileFetcher();
  const result = await mockFetcher.fetchProfile("did:plc:unknown");
  assertEquals(result, null);
});
