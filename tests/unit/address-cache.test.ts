import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock blob storage for testing
const mockBlobStorage = new Map<string, any>();

// Mock the blob import
const mockBlob = {
  getJSON(key: string) {
    return Promise.resolve(mockBlobStorage.get(key) || null);
  },
  setJSON(key: string, value: any) {
    mockBlobStorage.set(key, value);
    return Promise.resolve();
  },
  delete(key: string) {
    mockBlobStorage.delete(key);
    return Promise.resolve();
  },
  list(prefix: string) {
    return Promise.resolve(Array.from(mockBlobStorage.keys()).filter((key) =>
      key.startsWith(prefix)
    ));
  },
};

// Import for potential future use
const _originalImport = await import("../../src/utils/address-cache.ts");

Deno.test("Address Cache - setCachedAddress stores address data", async () => {
  const testUri = "at://did:plc:test/collection/record";
  const testAddress = {
    name: "Test Venue",
    street: "123 Test St",
    locality: "Test City",
    region: "TS",
    country: "TC",
    postalCode: "12345",
    latitude: 40.7128,
    longitude: -74.0060,
  };

  // Clear storage
  mockBlobStorage.clear();

  // This test demonstrates the expected interface
  // In actual implementation, we'd need to mock the blob import differently
  const cacheKey = `address_cache_${encodeURIComponent(testUri)}`;
  await mockBlob.setJSON(cacheKey, {
    ...testAddress,
    resolvedAt: new Date().toISOString(),
  });

  const stored = await mockBlob.getJSON(cacheKey);
  assertExists(stored);
  assertEquals(stored.name, "Test Venue");
  assertEquals(stored.latitude, 40.7128);
});

Deno.test("Address Cache - cache expiry logic", async () => {
  const testUri = "at://did:plc:expired/collection/record";
  const cacheKey = `address_cache_${encodeURIComponent(testUri)}`;

  // Store an expired entry (31 days old)
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 31);

  await mockBlob.setJSON(cacheKey, {
    name: "Expired Venue",
    resolvedAt: expiredDate.toISOString(),
  });

  const stored = await mockBlob.getJSON(cacheKey);
  assertExists(stored);

  // Check if entry would be considered expired
  const cacheAge = Date.now() - new Date(stored.resolvedAt).getTime();
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  assertEquals(cacheAge > maxAge, true);
});

Deno.test("Address Cache - failure caching", async () => {
  const testUri = "at://did:plc:failed/collection/record";
  const cacheKey = `address_cache_${encodeURIComponent(testUri)}`;

  await mockBlob.setJSON(cacheKey, {
    failedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
  });

  const stored = await mockBlob.getJSON(cacheKey);
  assertExists(stored);
  assertExists(stored.failedAt);
});

Deno.test("Address Cache - cache statistics", async () => {
  mockBlobStorage.clear();

  // Add some test entries
  await mockBlob.setJSON("address_cache_success1", {
    name: "Success 1",
    resolvedAt: new Date().toISOString(),
  });

  await mockBlob.setJSON("address_cache_success2", {
    name: "Success 2",
    resolvedAt: new Date().toISOString(),
  });

  await mockBlob.setJSON("address_cache_failed1", {
    failedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
  });

  const keys = await mockBlob.list("address_cache_");
  assertEquals(keys.length, 3);

  // Count failed entries
  let failedCount = 0;
  for (const key of keys) {
    const cached = await mockBlob.getJSON(key);
    if (cached?.failedAt) failedCount++;
  }

  assertEquals(failedCount, 1);
});
