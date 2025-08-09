import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  InMemoryStorageProvider,
  ProfileData,
} from "../../backend/utils/storage-provider.ts";

Deno.test("InMemoryStorageProvider - store and retrieve profile", async () => {
  const storage = new InMemoryStorageProvider();
  const profile: ProfileData = {
    did: "did:plc:test123",
    handle: "test.bsky.social",
    displayName: "Test User",
    avatar: "https://example.com/avatar.jpg",
    description: "A test user profile",
    fetchedAt: new Date().toISOString(),
  };

  await storage.setProfile(profile);
  const retrieved = await storage.getProfile(profile.did);

  assertExists(retrieved);
  assertEquals(retrieved.did, profile.did);
  assertEquals(retrieved.handle, profile.handle);
  assertEquals(retrieved.displayName, profile.displayName);
  assertEquals(retrieved.avatar, profile.avatar);
  assertEquals(retrieved.description, profile.description);
  assertEquals(retrieved.fetchedAt, profile.fetchedAt);
});

Deno.test("InMemoryStorageProvider - retrieve non-existent profile", async () => {
  const storage = new InMemoryStorageProvider();
  const result = await storage.getProfile("did:plc:nonexistent");
  assertEquals(result, null);
});

Deno.test("InMemoryStorageProvider - overwrite existing profile", async () => {
  const storage = new InMemoryStorageProvider();
  const did = "did:plc:overwrite123";

  const originalProfile: ProfileData = {
    did,
    handle: "original.bsky.social",
    displayName: "Original Name",
    fetchedAt: new Date().toISOString(),
  };

  const updatedProfile: ProfileData = {
    did,
    handle: "updated.bsky.social",
    displayName: "Updated Name",
    avatar: "https://example.com/new-avatar.jpg",
    fetchedAt: new Date().toISOString(),
  };

  await storage.setProfile(originalProfile);
  await storage.setProfile(updatedProfile);

  const retrieved = await storage.getProfile(did);
  assertExists(retrieved);
  assertEquals(retrieved.handle, "updated.bsky.social");
  assertEquals(retrieved.displayName, "Updated Name");
  assertEquals(retrieved.avatar, "https://example.com/new-avatar.jpg");
});

Deno.test("InMemoryStorageProvider - getStaleProfiles", async () => {
  const storage = new InMemoryStorageProvider();

  // Create profiles with different timestamps
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

  const profiles: ProfileData[] = [
    {
      did: "did:plc:fresh",
      handle: "fresh.bsky.social",
      fetchedAt: oneHourAgo.toISOString(),
    },
    {
      did: "did:plc:medium",
      handle: "medium.bsky.social",
      fetchedAt: sixHoursAgo.toISOString(),
    },
    {
      did: "did:plc:stale",
      handle: "stale.bsky.social",
      fetchedAt: twentyFiveHoursAgo.toISOString(),
    },
  ];

  for (const profile of profiles) {
    await storage.setProfile(profile);
  }

  // Get profiles older than 24 hours (stale threshold)
  const staleProfiles = await storage.getStaleProfiles(10, 24);

  assertEquals(staleProfiles.length, 1);
  assertEquals(staleProfiles[0].did, "did:plc:stale");
});

Deno.test("InMemoryStorageProvider - getStaleProfiles with limit", async () => {
  const storage = new InMemoryStorageProvider();

  // Create multiple stale profiles
  const twentyFiveHoursAgo = new Date();
  twentyFiveHoursAgo.setHours(twentyFiveHoursAgo.getHours() - 25);

  const staleProfiles: ProfileData[] = [
    {
      did: "did:plc:stale1",
      handle: "stale1.bsky.social",
      fetchedAt: new Date(twentyFiveHoursAgo.getTime() - 1000).toISOString(),
    },
    {
      did: "did:plc:stale2",
      handle: "stale2.bsky.social",
      fetchedAt: new Date(twentyFiveHoursAgo.getTime() - 2000).toISOString(),
    },
    {
      did: "did:plc:stale3",
      handle: "stale3.bsky.social",
      fetchedAt: new Date(twentyFiveHoursAgo.getTime() - 3000).toISOString(),
    },
  ];

  for (const profile of staleProfiles) {
    await storage.setProfile(profile);
  }

  // Get only 2 stale profiles
  const result = await storage.getStaleProfiles(2, 24);

  assertEquals(result.length, 2);
  // Should be sorted by fetchedAt (oldest first)
  assertEquals(result[0].did, "did:plc:stale3");
  assertEquals(result[1].did, "did:plc:stale2");
});

Deno.test("InMemoryStorageProvider - getStaleProfiles empty result", async () => {
  const storage = new InMemoryStorageProvider();

  // Add only fresh profiles
  const freshProfile: ProfileData = {
    did: "did:plc:fresh",
    handle: "fresh.bsky.social",
    fetchedAt: new Date().toISOString(),
  };

  await storage.setProfile(freshProfile);

  const staleProfiles = await storage.getStaleProfiles(10, 24);
  assertEquals(staleProfiles.length, 0);
});

Deno.test("InMemoryStorageProvider - clear functionality", () => {
  const storage = new InMemoryStorageProvider();

  // Add a profile
  const profile: ProfileData = {
    did: "did:plc:clear",
    handle: "clear.bsky.social",
    fetchedAt: new Date().toISOString(),
  };

  storage.setProfile(profile);
  storage.clear();

  // Profile should be gone after clear
  storage.getProfile("did:plc:clear").then((result) => {
    assertEquals(result, null);
  });
});

Deno.test("InMemoryStorageProvider - ensureTablesExist", async () => {
  const storage = new InMemoryStorageProvider();
  // Should not throw for in-memory storage
  await storage.ensureTablesExist();
});

Deno.test("InMemoryStorageProvider - profile with minimal data", async () => {
  const storage = new InMemoryStorageProvider();
  const minimalProfile: ProfileData = {
    did: "did:plc:minimal",
    handle: "minimal.bsky.social",
    fetchedAt: new Date().toISOString(),
  };

  await storage.setProfile(minimalProfile);
  const retrieved = await storage.getProfile(minimalProfile.did);

  assertExists(retrieved);
  assertEquals(retrieved.did, "did:plc:minimal");
  assertEquals(retrieved.handle, "minimal.bsky.social");
  assertEquals(retrieved.displayName, undefined);
  assertEquals(retrieved.avatar, undefined);
  assertEquals(retrieved.description, undefined);
  assertExists(retrieved.fetchedAt);
});
