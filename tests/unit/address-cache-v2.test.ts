import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  AddressData,
  InMemoryBlobStorage,
} from "../../src/utils/universal-storage.ts";

// Address cache service interface
interface AddressCacheService {
  getAddress(uri: string): Promise<AddressData | null>;
  setAddress(address: AddressData): Promise<void>;
  getCachedAddresses(): Promise<string[]>;
  clearExpiredAddresses(maxAgeHours: number): Promise<number>;
}

// Implementation using blob storage
class BlobAddressCacheService implements AddressCacheService {
  private static readonly CACHE_PREFIX = "address_cache_";
  private static readonly CACHE_TTL_HOURS = 24;

  constructor(private blobStorage: InMemoryBlobStorage) {}

  async getAddress(uri: string): Promise<AddressData | null> {
    const cacheKey = this.getCacheKey(uri);
    const cached = await this.blobStorage.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (this.isExpired(cached)) {
      await this.blobStorage.delete(cacheKey);
      return null;
    }

    return cached;
  }

  async setAddress(address: AddressData): Promise<void> {
    const cacheKey = this.getCacheKey(address.uri);
    const cacheEntry = {
      ...address,
      cachedAt: new Date().toISOString(),
    };

    await this.blobStorage.set(cacheKey, cacheEntry);
  }

  async getCachedAddresses(): Promise<string[]> {
    const keys = await this.blobStorage.list(
      BlobAddressCacheService.CACHE_PREFIX,
    );
    return keys.map((key) =>
      key.replace(BlobAddressCacheService.CACHE_PREFIX, "")
    );
  }

  async clearExpiredAddresses(maxAgeHours: number): Promise<number> {
    const keys = await this.blobStorage.list(
      BlobAddressCacheService.CACHE_PREFIX,
    );
    let clearedCount = 0;

    for (const key of keys) {
      const cached = await this.blobStorage.get(key);
      if (cached && this.isExpired(cached, maxAgeHours)) {
        await this.blobStorage.delete(key);
        clearedCount++;
      }
    }

    return clearedCount;
  }

  private getCacheKey(uri: string): string {
    return `${BlobAddressCacheService.CACHE_PREFIX}${uri}`;
  }

  private isExpired(
    cached: any,
    maxAgeHours: number = BlobAddressCacheService.CACHE_TTL_HOURS,
  ): boolean {
    if (!cached.cachedAt) return false;

    const cachedAt = new Date(cached.cachedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60);
    return hoursDiff > maxAgeHours;
  }
}

// Tests
Deno.test("Address Cache v2 - basic operations", async () => {
  const blobStorage = new InMemoryBlobStorage();
  const cache = new BlobAddressCacheService(blobStorage);

  // Should return null for non-existent address
  const notFound = await cache.getAddress(
    "at://did:plc:test/com.atproto.repo.strongRef/address1",
  );
  assertEquals(notFound, null);

  // Should store and retrieve address
  const address: AddressData = {
    uri: "at://did:plc:test/com.atproto.repo.strongRef/address1",
    cid: "bafyreicid123",
    name: "Test Location",
    street: "123 Test St",
    locality: "Test City",
    region: "Test State",
    country: "US",
    postalCode: "12345",
    latitude: 37.7749,
    longitude: -122.4194,
    resolvedAt: new Date().toISOString(),
  };

  await cache.setAddress(address);

  const retrieved = await cache.getAddress(address.uri);
  assertExists(retrieved);
  assertEquals(retrieved.uri, address.uri);
  assertEquals(retrieved.name, "Test Location");
  assertEquals(retrieved.street, "123 Test St");
  assertEquals(retrieved.latitude, 37.7749);
  assertEquals(retrieved.longitude, -122.4194);
});

Deno.test("Address Cache v2 - cache expiration", async () => {
  const blobStorage = new InMemoryBlobStorage();
  const cache = new BlobAddressCacheService(blobStorage);

  // Manually create expired cache entry
  const expiredAddress = {
    uri: "at://did:plc:test/com.atproto.repo.strongRef/expired",
    name: "Expired Location",
    cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
  };

  await blobStorage.set(
    "address_cache_at://did:plc:test/com.atproto.repo.strongRef/expired",
    expiredAddress,
  );

  // Should return null for expired cache
  const result = await cache.getAddress(
    "at://did:plc:test/com.atproto.repo.strongRef/expired",
  );
  assertEquals(result, null);

  // Should clean up expired entry
  const keys = await blobStorage.list("address_cache_");
  assertEquals(keys.length, 0);
});

Deno.test("Address Cache v2 - list cached addresses", async () => {
  const blobStorage = new InMemoryBlobStorage();
  const cache = new BlobAddressCacheService(blobStorage);

  // Add multiple addresses
  const addresses = [
    {
      uri: "at://did:plc:test/com.atproto.repo.strongRef/addr1",
      name: "Location 1",
    },
    {
      uri: "at://did:plc:test/com.atproto.repo.strongRef/addr2",
      name: "Location 2",
    },
    {
      uri: "at://did:plc:test/com.atproto.repo.strongRef/addr3",
      name: "Location 3",
    },
  ];

  for (const addr of addresses) {
    await cache.setAddress(addr as AddressData);
  }

  // Should list all cached addresses
  const cachedUris = await cache.getCachedAddresses();
  assertEquals(cachedUris.length, 3);
  assertEquals(
    cachedUris.sort(),
    [
      "at://did:plc:test/com.atproto.repo.strongRef/addr1",
      "at://did:plc:test/com.atproto.repo.strongRef/addr2",
      "at://did:plc:test/com.atproto.repo.strongRef/addr3",
    ].sort(),
  );
});

Deno.test("Address Cache v2 - clear expired addresses", async () => {
  const blobStorage = new InMemoryBlobStorage();
  const cache = new BlobAddressCacheService(blobStorage);

  // Add fresh address
  const freshAddress: AddressData = {
    uri: "at://did:plc:test/com.atproto.repo.strongRef/fresh",
    name: "Fresh Location",
  };
  await cache.setAddress(freshAddress);

  // Manually add expired addresses
  const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  await blobStorage.set(
    "address_cache_at://did:plc:test/com.atproto.repo.strongRef/expired1",
    {
      uri: "at://did:plc:test/com.atproto.repo.strongRef/expired1",
      name: "Expired 1",
      cachedAt: expiredTime,
    },
  );

  await blobStorage.set(
    "address_cache_at://did:plc:test/com.atproto.repo.strongRef/expired2",
    {
      uri: "at://did:plc:test/com.atproto.repo.strongRef/expired2",
      name: "Expired 2",
      cachedAt: expiredTime,
    },
  );

  // Should have 3 total addresses
  const beforeCleanup = await cache.getCachedAddresses();
  assertEquals(beforeCleanup.length, 3);

  // Clear expired addresses
  const clearedCount = await cache.clearExpiredAddresses(24);
  assertEquals(clearedCount, 2);

  // Should have 1 remaining address
  const afterCleanup = await cache.getCachedAddresses();
  assertEquals(afterCleanup.length, 1);
  assertEquals(
    afterCleanup[0],
    "at://did:plc:test/com.atproto.repo.strongRef/fresh",
  );
});

Deno.test("Address Cache v2 - handle missing cache metadata", async () => {
  const blobStorage = new InMemoryBlobStorage();
  const cache = new BlobAddressCacheService(blobStorage);

  // Manually add address without cachedAt timestamp
  const addressWithoutTimestamp = {
    uri: "at://did:plc:test/com.atproto.repo.strongRef/no-timestamp",
    name: "No Timestamp Location",
  };

  await blobStorage.set(
    "address_cache_at://did:plc:test/com.atproto.repo.strongRef/no-timestamp",
    addressWithoutTimestamp,
  );

  // Should return address (not expired if no timestamp)
  const result = await cache.getAddress(
    "at://did:plc:test/com.atproto.repo.strongRef/no-timestamp",
  );
  assertExists(result);
  assertEquals(result.name, "No Timestamp Location");
});

Deno.test("Address Cache v2 - update existing address", async () => {
  const blobStorage = new InMemoryBlobStorage();
  const cache = new BlobAddressCacheService(blobStorage);

  // Add initial address
  const initialAddress: AddressData = {
    uri: "at://did:plc:test/com.atproto.repo.strongRef/update",
    name: "Initial Name",
    street: "Old Street",
  };

  await cache.setAddress(initialAddress);

  // Update address
  const updatedAddress: AddressData = {
    uri: "at://did:plc:test/com.atproto.repo.strongRef/update",
    name: "Updated Name",
    street: "New Street",
    locality: "New City",
  };

  await cache.setAddress(updatedAddress);

  // Should have updated data
  const retrieved = await cache.getAddress(
    "at://did:plc:test/com.atproto.repo.strongRef/update",
  );
  assertExists(retrieved);
  assertEquals(retrieved.name, "Updated Name");
  assertEquals(retrieved.street, "New Street");
  assertEquals(retrieved.locality, "New City");

  // Should still have only one cache entry
  const cachedUris = await cache.getCachedAddresses();
  assertEquals(cachedUris.length, 1);
});
