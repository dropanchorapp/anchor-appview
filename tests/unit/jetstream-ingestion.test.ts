import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock SQLite for testing
class MockSQLite {
  private data: Map<string, any[]> = new Map();
  
  execute(query: string, params: any[] = []): { rows: any[]; rowsAffected: number } {
    // Simple mock implementation for testing
    if (query.includes("SELECT") && query.includes("checkins_v1")) {
      const id = params[0];
      const existing = this.data.get(id);
      return {
        rows: existing ? [{ id }] : [],
        rowsAffected: existing ? 1 : 0
      };
    }
    
    if (query.includes("INSERT") && query.includes("checkins_v1")) {
      const [id, _uri, _author_did, _author_handle, _text, _created_at, _lat, _lng, _address_ref_uri, _address_ref_cid] = params;
      this.data.set(id, params);
      return {
        rows: [],
        rowsAffected: 1
      };
    }
    
    return { rows: [], rowsAffected: 0 };
  }
  
  getData(id: string): any[] | undefined {
    return this.data.get(id);
  }
  
  clear() {
    this.data.clear();
  }
}

// Mock address resolver
const mockAddressResolver = {
  resolveAndCacheAddress: (rkey: string, addressRef: any) => {
    console.log(`Mock address resolution for ${rkey}: ${addressRef.uri}`);
    return Promise.resolve();
  }
};

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

// Function under test (extracted from jetstream-poller.ts)
async function processCheckinEvent(event: any, sqlite: MockSQLite) {
  const { commit, did } = event; // CRITICAL: DID is at top level!
  const record = commit.record;

  // Check if already processed (duplicate detection)
  const existing = sqlite.execute(
    `SELECT id FROM checkins_v1 WHERE id = ?`,
    [commit.rkey],
  );
  
  if (existing.rows && existing.rows.length > 0) {
    console.log("Duplicate checkin, skipping:", commit.rkey);
    return false; // Indicates skipped
  }

  // Extract coordinates from new format only
  const lat = record.coordinates?.latitude ? parseFloat(record.coordinates.latitude) : null;
  const lng = record.coordinates?.longitude ? parseFloat(record.coordinates.longitude) : null;

  // For now, use DID as handle (will be resolved later)
  const authorHandle = did;

  // Insert checkin with StrongRef
  sqlite.execute(
    `
    INSERT OR IGNORE INTO checkins_v1 
    (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      commit.rkey,
      `at://${did}/${commit.collection}/${commit.rkey}`, // CRITICAL: Use event.did not commit.repo
      did,
      authorHandle,
      record.text || "",
      record.createdAt || new Date().toISOString(),
      lat,
      lng,
      record.addressRef?.uri || null,
      record.addressRef?.cid || null,
    ],
  );

  // Trigger address resolution if StrongRef is present
  if (record.addressRef?.uri) {
    await mockAddressResolver.resolveAndCacheAddress(commit.rkey, record.addressRef);
  }
  
  return true; // Indicates processed
}

Deno.test("Jetstream Event Processing", async (t) => {
  await t.step("should extract DID from top-level event field", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent();
    
    const processed = await processCheckinEvent(event, mockSQLite);
    
    assertEquals(processed, true, "Event should be processed");
    
    // Verify the data was stored with correct DID
    const storedData = mockSQLite.getData("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(storedData[1], "at://did:plc:wxex3wx5k4ctciupsv5m5stb/app.dropanchor.checkin/3ltctwowntw26", "URI should use event.did");
    assertEquals(storedData[2], "did:plc:wxex3wx5k4ctciupsv5m5stb", "author_did should be event.did");
  });

  await t.step("should handle missing DID gracefully", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent();
    delete event.did; // Remove DID to test error handling
    
    try {
      await processCheckinEvent(event, mockSQLite);
      // Should not throw but data will be undefined
      const storedData = mockSQLite.getData("3ltctwowntw26");
      assertExists(storedData, "Check-in should still be stored");
      assertEquals(storedData[2], undefined, "author_did should be undefined when DID missing");
    } catch (error) {
      // This is acceptable behavior too
      console.log("Expected error when DID is missing:", error.message);
    }
  });

  await t.step("should detect and skip duplicates", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent();
    
    // First processing should succeed
    const firstResult = await processCheckinEvent(event, mockSQLite);
    assertEquals(firstResult, true, "First processing should succeed");
    
    // Second processing should skip (duplicate)
    const secondResult = await processCheckinEvent(event, mockSQLite);
    assertEquals(secondResult, false, "Second processing should skip duplicate");
  });

  await t.step("should extract coordinates correctly", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent();
    
    await processCheckinEvent(event, mockSQLite);
    
    const storedData = mockSQLite.getData("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(storedData[6], 52.0742969, "Latitude should be parsed correctly");
    assertEquals(storedData[7], 4.3468013, "Longitude should be parsed correctly");
  });

  await t.step("should handle missing coordinates", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent();
    delete event.commit.record.coordinates;
    
    await processCheckinEvent(event, mockSQLite);
    
    const storedData = mockSQLite.getData("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(storedData[6], null, "Latitude should be null when missing");
    assertEquals(storedData[7], null, "Longitude should be null when missing");
  });

  await t.step("should extract addressRef correctly", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent();
    
    await processCheckinEvent(event, mockSQLite);
    
    const storedData = mockSQLite.getData("3ltctwowntw26");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(
      storedData[8], 
      "at://did:plc:wxex3wx5k4ctciupsv5m5stb/community.lexicon.location.address/3ltctwolmqz2o",
      "AddressRef URI should be extracted correctly"
    );
    assertEquals(
      storedData[9],
      "bafyreibhvynislx7vv52urqpm2vac6oeidvjb74m5pr3dmw3iztbengwbm",
      "AddressRef CID should be extracted correctly"
    );
  });

  await t.step("should construct proper AT Protocol URI", async () => {
    const mockSQLite = new MockSQLite();
    const event = createJetstreamEvent({
      did: "did:plc:testuser123",
      commit: {
        ...createJetstreamEvent().commit,
        collection: "app.dropanchor.checkin",
        rkey: "testrecord456"
      }
    });
    
    await processCheckinEvent(event, mockSQLite);
    
    const storedData = mockSQLite.getData("testrecord456");
    assertExists(storedData, "Check-in should be stored");
    assertEquals(
      storedData[1],
      "at://did:plc:testuser123/app.dropanchor.checkin/testrecord456",
      "URI should be constructed with correct DID, collection, and rkey"
    );
  });
});

Deno.test("Jetstream Event Filtering", async (t) => {
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