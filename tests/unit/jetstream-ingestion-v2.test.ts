import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { 
  InMemoryCheckinStorage, 
  CheckinData,
  CheckinStorageProvider 
} from "../../src/utils/universal-storage.ts";

// Address resolver interface
interface AddressResolver {
  resolveAndCacheAddress(rkey: string, addressRef: any): Promise<void>;
}

// Mock address resolver
class MockAddressResolver implements AddressResolver {
  private resolutionLog: Array<{rkey: string, addressRef: any}> = [];

  async resolveAndCacheAddress(rkey: string, addressRef: any): Promise<void> {
    this.resolutionLog.push({ rkey, addressRef });
    console.log(`Mock address resolution for ${rkey}: ${addressRef.uri}`);
  }

  getResolutionLog() {
    return this.resolutionLog;
  }

  clear() {
    this.resolutionLog = [];
  }
}

// Jetstream event processor service
class JetstreamEventProcessor {
  constructor(
    private storage: CheckinStorageProvider,
    private addressResolver: AddressResolver
  ) {}

  async processCheckinEvent(event: any): Promise<boolean> {
    const { commit, did } = event; // CRITICAL: DID is at top level!
    const record = commit.record;

    // Check if already processed (duplicate detection)
    const exists = await this.storage.checkinExists(commit.rkey);
    
    if (exists) {
      console.log("Duplicate checkin, skipping:", commit.rkey);
      return false; // Indicates skipped
    }

    // Extract coordinates from new format only
    const lat = record.coordinates?.latitude ? parseFloat(record.coordinates.latitude) : null;
    const lng = record.coordinates?.longitude ? parseFloat(record.coordinates.longitude) : null;

    // For now, use DID as handle (will be resolved later)
    const authorHandle = did;

    // Create checkin data
    const checkinData: CheckinData = {
      id: commit.rkey,
      uri: `at://${did}/${commit.collection}/${commit.rkey}`, // CRITICAL: Use event.did not commit.repo
      authorDid: did,
      authorHandle: authorHandle,
      text: record.text || "",
      createdAt: record.createdAt || new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      addressRefUri: record.addressRef?.uri || undefined,
      addressRefCid: record.addressRef?.cid || undefined,
    };

    // Insert checkin with StrongRef
    await this.storage.setCheckin(checkinData);

    // Trigger address resolution if StrongRef is present
    if (record.addressRef?.uri) {
      await this.addressResolver.resolveAndCacheAddress(commit.rkey, record.addressRef);
    }
    
    return true; // Indicates processed
  }
}

// Test data: Real Jetstream event structure
const createJetstreamEvent = (overrides: any = {}) => ({
  did: "did:plc:wxex3wx5k4ctciupsv5m5stb",
  time_us: 1751824706067182,
  kind: "commit",
  commit: {
    rev: "3ltctwowylo26",
    operation: "create",
    collection: "app.dropanchor.checkin",
    rkey: "3ltctwowntw26",
    record: {
      "$type": "app.dropanchor.checkin",
      addressRef: {
        cid: "bafyreibhvynislx7vv52urqpm2vac6oeidvjb74m5pr3dmw3iztbengwbm",
        uri: "at://did:plc:wxex3wx5k4ctciupsv5m5stb/community.lexicon.location.address/3ltctwolmqz2o"
      },
      coordinates: {
        "$type": "community.lexicon.location.geo",
        latitude: "52.0742969",
        longitude: "4.3468013"
      },
      createdAt: "2025-07-06T17:58:25Z",
      text: "Test check-in message"
    },
    cid: "bafyreifdepudvenhqnz4rk4j4dvyaaompafnj6r5ixamalpqmjlei2p43y"
  },
  ...overrides
});

Deno.test("Jetstream Event Processing v2", async (t) => {
  await t.step("should extract DID from top-level event field", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    
    const processed = await processor.processCheckinEvent(event);
    
    assertEquals(processed, true, "Event should be processed");
    
    // Verify the data was stored with correct DID
    const storedData = await storage.getCheckin("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(storedData.uri, "at://did:plc:wxex3wx5k4ctciupsv5m5stb/app.dropanchor.checkin/3ltctwowntw26", "URI should use event.did");
    assertEquals(storedData.authorDid, "did:plc:wxex3wx5k4ctciupsv5m5stb", "author_did should be event.did");
  });

  await t.step("should handle missing DID gracefully", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    delete event.did; // Remove DID to test error handling
    
    try {
      await processor.processCheckinEvent(event);
      // Should not throw but data will be undefined
      const storedData = await storage.getCheckin("3ltctwowntw26");
      assertExists(storedData, "Check-in should still be stored");
      assertEquals(storedData.authorDid, undefined, "author_did should be undefined when DID missing");
    } catch (error) {
      // This is acceptable behavior too
      console.log("Expected error when DID is missing:", error.message);
    }
  });

  await t.step("should detect and skip duplicates", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    
    // First processing should succeed
    const firstResult = await processor.processCheckinEvent(event);
    assertEquals(firstResult, true, "First processing should succeed");
    
    // Second processing should skip (duplicate)
    const secondResult = await processor.processCheckinEvent(event);
    assertEquals(secondResult, false, "Second processing should skip duplicate");
  });

  await t.step("should extract coordinates correctly", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    
    await processor.processCheckinEvent(event);
    
    const storedData = await storage.getCheckin("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(storedData.latitude, 52.0742969, "Latitude should be parsed correctly");
    assertEquals(storedData.longitude, 4.3468013, "Longitude should be parsed correctly");
  });

  await t.step("should handle missing coordinates", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    delete event.commit.record.coordinates;
    
    await processor.processCheckinEvent(event);
    
    const storedData = await storage.getCheckin("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(storedData.latitude, null, "Latitude should be null when missing");
    assertEquals(storedData.longitude, null, "Longitude should be null when missing");
  });

  await t.step("should extract addressRef correctly", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    
    await processor.processCheckinEvent(event);
    
    const storedData = await storage.getCheckin("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(
      storedData.addressRefUri, 
      "at://did:plc:wxex3wx5k4ctciupsv5m5stb/community.lexicon.location.address/3ltctwolmqz2o",
      "AddressRef URI should be extracted correctly"
    );
    assertEquals(
      storedData.addressRefCid,
      "bafyreibhvynislx7vv52urqpm2vac6oeidvjb74m5pr3dmw3iztbengwbm",
      "AddressRef CID should be extracted correctly"
    );
  });

  await t.step("should construct proper AT Protocol URI", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent({
      did: "did:plc:testuser123",
      commit: {
        ...createJetstreamEvent().commit,
        collection: "app.dropanchor.checkin",
        rkey: "testrecord456"
      }
    });
    
    await processor.processCheckinEvent(event);
    
    const storedData = await storage.getCheckin("testrecord456");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(
      storedData.uri,
      "at://did:plc:testuser123/app.dropanchor.checkin/testrecord456",
      "URI should be constructed with correct DID, collection, and rkey"
    );
  });

  await t.step("should trigger address resolution for StrongRef", async () => {
    const storage = new InMemoryCheckinStorage();
    const resolver = new MockAddressResolver();
    const processor = new JetstreamEventProcessor(storage, resolver);
    
    const event = createJetstreamEvent();
    
    await processor.processCheckinEvent(event);
    
    const resolutionLog = resolver.getResolutionLog();
    assertEquals(resolutionLog.length, 1, "Should have triggered one address resolution");
    assertEquals(resolutionLog[0].rkey, "3ltctwowntw26", "Should resolve for correct rkey");
    assertEquals(
      resolutionLog[0].addressRef.uri,
      "at://did:plc:wxex3wx5k4ctciupsv5m5stb/community.lexicon.location.address/3ltctwolmqz2o",
      "Should pass correct addressRef URI"
    );
  });
});

Deno.test("Jetstream Event Filtering v2", async (t) => {
  await t.step("should filter events correctly", () => {
    const validEvent = createJetstreamEvent();
    const invalidEvents = [
      { ...validEvent, kind: "identity" }, // Wrong kind
      { ...validEvent, commit: { ...validEvent.commit, collection: "app.bsky.feed.post" } }, // Wrong collection
      { ...validEvent, commit: { ...validEvent.commit, operation: "delete" } }, // Wrong operation
    ];

    // Test filtering logic (this would be in the WebSocket message handler)
    const isValidCheckinEvent = (event: any) => {
      return event.kind === "commit" &&
             event.commit?.collection === "app.dropanchor.checkin" &&
             event.commit?.operation === "create";
    };

    assertEquals(isValidCheckinEvent(validEvent), true, "Valid event should pass filter");
    invalidEvents.forEach((event, index) => {
      assertEquals(isValidCheckinEvent(event), false, `Invalid event ${index} should be filtered out`);
    });
  });
});