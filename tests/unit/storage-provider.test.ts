import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  InMemoryStorageProvider,
  ProfileData,
} from "../../src/utils/storage-provider.ts";

Deno.test("InMemoryStorageProvider - basic operations", async () => {
  const storage = new InMemoryStorageProvider();

  // Should return null for non-existent profile
  const notFound = await storage.getProfile("did:plc:nonexistent");
  assertEquals(notFound, null);

  // Should store and retrieve profile
  const profile: ProfileData = {
    did: "did:plc:test",
    handle: "test.bsky.social",
    displayName: "Test User",
    avatar: "https://example.com/avatar.jpg",
    description: "Test description",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await storage.setProfile(profile);

  const retrieved = await storage.getProfile("did:plc:test");
  assertExists(retrieved);
  assertEquals(retrieved.did, "did:plc:test");
  assertEquals(retrieved.handle, "test.bsky.social");
  assertEquals(retrieved.displayName, "Test User");
  assertEquals(retrieved.avatar, "https://example.com/avatar.jpg");
  assertEquals(retrieved.description, "Test description");
});

Deno.test("InMemoryStorageProvider - update existing profile", async () => {
  const storage = new InMemoryStorageProvider();

  // Store initial profile
  const initialProfile: ProfileData = {
    did: "did:plc:test",
    handle: "old.bsky.social",
    displayName: "Old Name",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await storage.setProfile(initialProfile);

  // Update profile
  const updatedProfile: ProfileData = {
    did: "did:plc:test",
    handle: "new.bsky.social",
    displayName: "New Name",
    avatar: "https://example.com/new.jpg",
    fetchedAt: initialProfile.fetchedAt,
    updatedAt: new Date().toISOString(),
  };

  await storage.setProfile(updatedProfile);

  // Should have updated profile
  const retrieved = await storage.getProfile("did:plc:test");
  assertExists(retrieved);
  assertEquals(retrieved.handle, "new.bsky.social");
  assertEquals(retrieved.displayName, "New Name");
  assertEquals(retrieved.avatar, "https://example.com/new.jpg");
});

Deno.test("InMemoryStorageProvider - getStaleProfiles", async () => {
  const storage = new InMemoryStorageProvider();

  // Create profiles with different ages
  const now = new Date();
  const fresh = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
  const stale1 = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
  const stale2 = new Date(now.getTime() - 30 * 60 * 60 * 1000); // 30 hours ago

  await storage.setProfile({
    did: "did:plc:fresh",
    handle: "fresh.bsky.social",
    displayName: "Fresh User",
    fetchedAt: fresh.toISOString(),
    updatedAt: fresh.toISOString(),
  });

  await storage.setProfile({
    did: "did:plc:stale1",
    handle: "stale1.bsky.social",
    displayName: "Stale User 1",
    fetchedAt: stale1.toISOString(),
    updatedAt: stale1.toISOString(),
  });

  await storage.setProfile({
    did: "did:plc:stale2",
    handle: "stale2.bsky.social",
    displayName: "Stale User 2",
    fetchedAt: stale2.toISOString(),
    updatedAt: stale2.toISOString(),
  });

  // Get stale profiles (24 hour threshold)
  const staleProfiles = await storage.getStaleProfiles(10, 24);

  // Should return 2 stale profiles, sorted by age (oldest first)
  assertEquals(staleProfiles.length, 2);
  assertEquals(staleProfiles[0].did, "did:plc:stale2"); // Oldest
  assertEquals(staleProfiles[1].did, "did:plc:stale1"); // Newer stale
});

Deno.test("InMemoryStorageProvider - getStaleProfiles with limit", async () => {
  const storage = new InMemoryStorageProvider();

  // Create multiple stale profiles
  const baseTime = new Date().getTime() - 25 * 60 * 60 * 1000; // 25 hours ago

  for (let i = 0; i < 5; i++) {
    await storage.setProfile({
      did: `did:plc:stale${i}`,
      handle: `stale${i}.bsky.social`,
      displayName: `Stale User ${i}`,
      fetchedAt: new Date(baseTime - i * 60 * 1000).toISOString(), // Slightly different times
      updatedAt: new Date(baseTime - i * 60 * 1000).toISOString(),
    });
  }

  // Get limited number of stale profiles
  const staleProfiles = await storage.getStaleProfiles(3, 24);

  // Should return only 3 profiles
  assertEquals(staleProfiles.length, 3);

  // Should be sorted by age (oldest first)
  assertEquals(staleProfiles[0].did, "did:plc:stale4"); // Oldest
  assertEquals(staleProfiles[1].did, "did:plc:stale3");
  assertEquals(staleProfiles[2].did, "did:plc:stale2");
});

Deno.test("InMemoryStorageProvider - clear functionality", async () => {
  const storage = new InMemoryStorageProvider();

  // Store some profiles
  await storage.setProfile({
    did: "did:plc:test1",
    handle: "test1.bsky.social",
    displayName: "Test 1",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await storage.setProfile({
    did: "did:plc:test2",
    handle: "test2.bsky.social",
    displayName: "Test 2",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Should have profiles
  const before1 = await storage.getProfile("did:plc:test1");
  const before2 = await storage.getProfile("did:plc:test2");
  assertExists(before1);
  assertExists(before2);

  // Clear storage
  storage.clear();

  // Should be empty
  const after1 = await storage.getProfile("did:plc:test1");
  const after2 = await storage.getProfile("did:plc:test2");
  assertEquals(after1, null);
  assertEquals(after2, null);

  // Should have no stale profiles
  const staleProfiles = await storage.getStaleProfiles(10, 0);
  assertEquals(staleProfiles.length, 0);
});

Deno.test("InMemoryStorageProvider - ensureTablesExist is no-op", async () => {
  const storage = new InMemoryStorageProvider();

  // Should not throw
  await storage.ensureTablesExist();

  // Should still work normally
  await storage.setProfile({
    did: "did:plc:test",
    handle: "test.bsky.social",
    displayName: "Test User",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const retrieved = await storage.getProfile("did:plc:test");
  assertExists(retrieved);
  assertEquals(retrieved.did, "did:plc:test");
});
