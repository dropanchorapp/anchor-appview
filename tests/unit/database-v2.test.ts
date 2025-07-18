import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { 
  InMemoryCheckinStorage, 
  InMemoryAddressStorage,
  CheckinData,
  AddressData,
  CheckinStorageProvider,
  AddressStorageProvider 
} from "../../src/utils/universal-storage.ts";

// Database service interface
interface DatabaseService {
  getCheckin(id: string): Promise<CheckinData | null>;
  setCheckin(checkin: CheckinData): Promise<void>;
  checkinExists(id: string): Promise<boolean>;
  getCheckinsByAuthor(authorDid: string, limit?: number): Promise<CheckinData[]>;
  getAllCheckins(limit?: number): Promise<CheckinData[]>;
  getAddress(uri: string): Promise<AddressData | null>;
  setAddress(address: AddressData): Promise<void>;
  getFailedAddresses(limit?: number): Promise<AddressData[]>;
  ensureTablesExist(): Promise<void>;
}

// Database service implementation
class DatabaseServiceImpl implements DatabaseService {
  constructor(
    private checkinStorage: CheckinStorageProvider,
    private addressStorage: AddressStorageProvider
  ) {}

  async getCheckin(id: string): Promise<CheckinData | null> {
    return await this.checkinStorage.getCheckin(id);
  }

  async setCheckin(checkin: CheckinData): Promise<void> {
    await this.checkinStorage.setCheckin(checkin);
  }

  async checkinExists(id: string): Promise<boolean> {
    return await this.checkinStorage.checkinExists(id);
  }

  async getCheckinsByAuthor(authorDid: string, limit?: number): Promise<CheckinData[]> {
    return await this.checkinStorage.getCheckinsByAuthor(authorDid, limit);
  }

  async getAllCheckins(limit?: number): Promise<CheckinData[]> {
    return await this.checkinStorage.getAllCheckins(limit);
  }

  async getAddress(uri: string): Promise<AddressData | null> {
    return await this.addressStorage.getAddress(uri);
  }

  async setAddress(address: AddressData): Promise<void> {
    await this.addressStorage.setAddress(address);
  }

  async getFailedAddresses(limit?: number): Promise<AddressData[]> {
    return await this.addressStorage.getFailedAddresses(limit);
  }

  async ensureTablesExist(): Promise<void> {
    await this.checkinStorage.ensureTablesExist();
    await this.addressStorage.ensureTablesExist();
  }
}

// Test database operations
Deno.test("Database v2 - checkin operations", async (t) => {
  await t.step("should store and retrieve checkin", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    await dbService.ensureTablesExist();

    // Should return null for non-existent checkin
    const notFound = await dbService.getCheckin("nonexistent");
    assertEquals(notFound, null);

    // Should store and retrieve checkin
    const checkinData: CheckinData = {
      id: "test123",
      uri: "at://did:plc:test/app.dropanchor.checkin/test123",
      authorDid: "did:plc:test",
      authorHandle: "test.bsky.social",
      text: "Great coffee!",
      createdAt: "2024-01-01T12:00:00Z",
      latitude: 40.7128,
      longitude: -74.0060,
      addressRefUri: "at://did:plc:test/community.lexicon.location.address/addr123",
      addressRefCid: "bafyreicid123"
    };

    await dbService.setCheckin(checkinData);

    const retrieved = await dbService.getCheckin("test123");
    assertExists(retrieved);
    assertEquals(retrieved.id, "test123");
    assertEquals(retrieved.text, "Great coffee!");
    assertEquals(retrieved.latitude, 40.7128);
    assertEquals(retrieved.longitude, -74.0060);
    assertEquals(retrieved.addressRefUri, "at://did:plc:test/community.lexicon.location.address/addr123");
  });

  await t.step("should check checkin existence", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    // Should return false for non-existent checkin
    const notExists = await dbService.checkinExists("nonexistent");
    assertEquals(notExists, false);

    // Add a checkin
    const checkinData: CheckinData = {
      id: "exists123",
      uri: "at://did:plc:test/app.dropanchor.checkin/exists123",
      authorDid: "did:plc:test",
      authorHandle: "test.bsky.social",
      text: "Existing checkin",
      createdAt: "2024-01-01T12:00:00Z"
    };

    await dbService.setCheckin(checkinData);

    // Should return true for existing checkin
    const exists = await dbService.checkinExists("exists123");
    assertEquals(exists, true);
  });

  await t.step("should get checkins by author", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    // Add checkins from different authors
    const checkins: CheckinData[] = [
      {
        id: "author1_checkin1",
        uri: "at://did:plc:author1/app.dropanchor.checkin/author1_checkin1",
        authorDid: "did:plc:author1",
        authorHandle: "author1.bsky.social",
        text: "First checkin",
        createdAt: "2024-01-01T12:00:00Z"
      },
      {
        id: "author1_checkin2",
        uri: "at://did:plc:author1/app.dropanchor.checkin/author1_checkin2",
        authorDid: "did:plc:author1",
        authorHandle: "author1.bsky.social",
        text: "Second checkin",
        createdAt: "2024-01-01T13:00:00Z"
      },
      {
        id: "author2_checkin1",
        uri: "at://did:plc:author2/app.dropanchor.checkin/author2_checkin1",
        authorDid: "did:plc:author2",
        authorHandle: "author2.bsky.social",
        text: "Other author checkin",
        createdAt: "2024-01-01T14:00:00Z"
      }
    ];

    for (const checkin of checkins) {
      await dbService.setCheckin(checkin);
    }

    // Should get only checkins from author1
    const author1Checkins = await dbService.getCheckinsByAuthor("did:plc:author1");
    assertEquals(author1Checkins.length, 2);
    assertEquals(author1Checkins[0].authorDid, "did:plc:author1");
    assertEquals(author1Checkins[1].authorDid, "did:plc:author1");

    // Should respect limit
    const limitedCheckins = await dbService.getCheckinsByAuthor("did:plc:author1", 1);
    assertEquals(limitedCheckins.length, 1);
  });

  await t.step("should get all checkins", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    // Add multiple checkins
    for (let i = 1; i <= 5; i++) {
      const checkinData: CheckinData = {
        id: `checkin${i}`,
        uri: `at://did:plc:user${i}/app.dropanchor.checkin/checkin${i}`,
        authorDid: `did:plc:user${i}`,
        authorHandle: `user${i}.bsky.social`,
        text: `Checkin ${i}`,
        createdAt: `2024-01-0${i}T12:00:00Z`
      };
      await dbService.setCheckin(checkinData);
    }

    // Should get all checkins
    const allCheckins = await dbService.getAllCheckins();
    assertEquals(allCheckins.length, 5);

    // Should respect limit
    const limitedCheckins = await dbService.getAllCheckins(3);
    assertEquals(limitedCheckins.length, 3);
  });
});

Deno.test("Database v2 - address operations", async (t) => {
  await t.step("should store and retrieve address", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    await dbService.ensureTablesExist();

    // Should return null for non-existent address
    const notFound = await dbService.getAddress("nonexistent");
    assertEquals(notFound, null);

    // Should store and retrieve address
    const addressData: AddressData = {
      uri: "at://did:plc:test/community.lexicon.location.address/addr123",
      cid: "bafyreicid123",
      name: "Test Cafe",
      street: "123 Test Street",
      locality: "Test City",
      region: "Test State",
      country: "US",
      postalCode: "12345",
      latitude: 40.7128,
      longitude: -74.0060,
      resolvedAt: "2024-01-01T12:00:00Z"
    };

    await dbService.setAddress(addressData);

    const retrieved = await dbService.getAddress("at://did:plc:test/community.lexicon.location.address/addr123");
    assertExists(retrieved);
    assertEquals(retrieved.uri, "at://did:plc:test/community.lexicon.location.address/addr123");
    assertEquals(retrieved.name, "Test Cafe");
    assertEquals(retrieved.street, "123 Test Street");
    assertEquals(retrieved.latitude, 40.7128);
    assertEquals(retrieved.longitude, -74.0060);
  });

  await t.step("should handle failed address resolution", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    // Add failed address
    const failedAddress: AddressData = {
      uri: "at://did:plc:test/community.lexicon.location.address/failed123",
      failedAt: "2024-01-01T12:00:00Z"
    };

    await dbService.setAddress(failedAddress);

    // Should retrieve failed addresses
    const failedAddresses = await dbService.getFailedAddresses();
    assertEquals(failedAddresses.length, 1);
    assertEquals(failedAddresses[0].uri, "at://did:plc:test/community.lexicon.location.address/failed123");
    assertEquals(failedAddresses[0].failedAt, "2024-01-01T12:00:00Z");
  });

  await t.step("should update existing address", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    const uri = "at://did:plc:test/community.lexicon.location.address/update123";

    // Add initial address
    const initialAddress: AddressData = {
      uri: uri,
      name: "Initial Name",
      street: "Old Street"
    };

    await dbService.setAddress(initialAddress);

    // Update address
    const updatedAddress: AddressData = {
      uri: uri,
      name: "Updated Name",
      street: "New Street",
      locality: "New City"
    };

    await dbService.setAddress(updatedAddress);

    // Should have updated data
    const retrieved = await dbService.getAddress(uri);
    assertExists(retrieved);
    assertEquals(retrieved.name, "Updated Name");
    assertEquals(retrieved.street, "New Street");
    assertEquals(retrieved.locality, "New City");
  });
});

Deno.test("Database v2 - schema validation", async (t) => {
  await t.step("should handle ensureTablesExist", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    // Should not throw
    await dbService.ensureTablesExist();
  });

  await t.step("should handle complex data types", async () => {
    const checkinStorage = new InMemoryCheckinStorage();
    const addressStorage = new InMemoryAddressStorage();
    const dbService = new DatabaseServiceImpl(checkinStorage, addressStorage);

    // Test with full address data including JSON
    const addressData: AddressData = {
      uri: "at://did:plc:test/community.lexicon.location.address/complex123",
      cid: "bafyreicid123",
      name: "Complex Location",
      street: "123 Complex Street",
      locality: "Complex City",
      region: "Complex State",
      country: "US",
      postalCode: "12345",
      latitude: 40.7128,
      longitude: -74.0060,
      fullData: {
        amenities: ["wifi", "parking"],
        rating: 4.5,
        tags: { cuisine: "italian", price: "$$" }
      },
      resolvedAt: "2024-01-01T12:00:00Z"
    };

    await dbService.setAddress(addressData);

    const retrieved = await dbService.getAddress("at://did:plc:test/community.lexicon.location.address/complex123");
    assertExists(retrieved);
    assertEquals(retrieved.fullData?.amenities, ["wifi", "parking"]);
    assertEquals(retrieved.fullData?.rating, 4.5);
    assertEquals(retrieved.fullData?.tags?.cuisine, "italian");
  });
});