import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { restore, stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { mockSqlite } from "../mocks/sqlite-mock.ts";

// Import the API handler
import anchorAPI from "../../src/api/anchor-api.ts";

// Mock sqlite for testing
let sqliteStub: any;

// Helper to create test check-ins
async function createTestCheckins() {
  // Set up sqlite mock
  sqliteStub = stub(
    await import("https://esm.town/v/stevekrouse/sqlite"),
    "sqlite",
    mockSqlite as any
  );
  
  // Clear test data
  mockSqlite.clear();
  
  // Ensure tables exist
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT,
      author_did TEXT,
      author_handle TEXT,
      text TEXT,
      created_at TEXT,
      latitude REAL,
      longitude REAL
    )
  `);
  
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS profile_cache_v1 (
      did TEXT PRIMARY KEY,
      handle TEXT,
      display_name TEXT,
      avatar TEXT,
      fetched_at TEXT,
      updated_at TEXT
    )
  `);
  
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS user_follows_v1 (
      follower_did TEXT,
      following_did TEXT
    )
  `);
  
  // Insert test check-ins
  await mockSqlite.execute(
    `INSERT INTO checkins_v1 
     (id, uri, author_did, author_handle, text, created_at, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "checkin1",
      "at://did:plc:user1/app.dropanchor.checkin/checkin1",
      "did:plc:user1",
      "user1.bsky.social",
      "Great coffee!",
      "2025-01-18T10:00:00Z",
      37.7749,
      -122.4194,
    ]
  );
  
  await mockSqlite.execute(
    `INSERT INTO checkins_v1 
     (id, uri, author_did, author_handle, text, created_at, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "checkin2",
      "at://did:plc:user2/app.dropanchor.checkin/checkin2",
      "did:plc:user2",
      "user2.bsky.social",
      "Love this place!",
      "2025-01-18T09:00:00Z",
      37.7751,
      -122.4180,
    ]
  );
  
  // Insert test profiles
  const now = new Date().toISOString();
  
  await mockSqlite.execute(
    `INSERT INTO profile_cache_v1 
     (did, handle, display_name, avatar, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "did:plc:user1",
      "user1.bsky.social",
      "Test User 1",
      "https://cdn.bsky.app/avatar/user1",
      now,
      now,
    ]
  );
  
  await mockSqlite.execute(
    `INSERT INTO profile_cache_v1 
     (did, handle, display_name, avatar, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "did:plc:user2",
      "user2.bsky.social",
      "Test User 2",
      "https://cdn.bsky.app/avatar/user2",
      now,
      now,
    ]
  );
}

// Mock fetch for profile resolution
function setupProfileFetchMock() {
  return stub(globalThis, "fetch", (url: string) => {
    if (url.includes("app.bsky.actor.getProfile")) {
      if (url.includes("did:plc:user3")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              did: "did:plc:user3",
              handle: "user3.bsky.social",
              displayName: "New User 3",
              avatar: "https://cdn.bsky.app/avatar/user3",
            }),
            { status: 200 }
          )
        );
      }
    }
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });
}

Deno.test("API - Global feed includes profile data", async () => {
  await createTestCheckins();
  const _fetchStub = setupProfileFetchMock();
  
  try {
    const request = new Request("https://test.com/global");
    const response = await anchorAPI(request);
    
    assertEquals(response.status, 200);
    
    const data = await response.json();
    assertExists(data.checkins);
    assertEquals(data.checkins.length, 2);
    
    // Check first check-in has profile data
    const checkin1 = data.checkins[0];
    assertEquals(checkin1.id, "checkin1");
    assertExists(checkin1.author);
    assertEquals(checkin1.author.did, "did:plc:user1");
    assertEquals(checkin1.author.handle, "user1.bsky.social");
    assertEquals(checkin1.author.displayName, "Test User 1");
    assertEquals(checkin1.author.avatar, "https://cdn.bsky.app/avatar/user1");
    
    // Check second check-in
    const checkin2 = data.checkins[1];
    assertEquals(checkin2.author.displayName, "Test User 2");
    assertEquals(checkin2.author.avatar, "https://cdn.bsky.app/avatar/user2");
  } finally {
    restore();
    if (sqliteStub) sqliteStub.restore();
  }
});

Deno.test("API - Nearby feed includes profile data", async () => {
  await createTestCheckins();
  const _fetchStub = setupProfileFetchMock();
  
  try {
    const request = new Request("https://test.com/nearby?lat=37.7750&lng=-122.4190&radius=1");
    const response = await anchorAPI(request);
    
    assertEquals(response.status, 200);
    
    const data = await response.json();
    assertExists(data.checkins);
    
    // All nearby check-ins should have profile data
    for (const checkin of data.checkins) {
      assertExists(checkin.author);
      assertExists(checkin.author.did);
      assertExists(checkin.author.handle);
      assertExists(checkin.author.displayName);
      assertExists(checkin.author.avatar);
      assertExists(checkin.distance);
    }
  } finally {
    restore();
    if (sqliteStub) sqliteStub.restore();
  }
});

Deno.test("API - User feed includes profile data", async () => {
  await createTestCheckins();
  const _fetchStub = setupProfileFetchMock();
  
  try {
    const request = new Request("https://test.com/user?did=did:plc:user1");
    const response = await anchorAPI(request);
    
    assertEquals(response.status, 200);
    
    const data = await response.json();
    assertExists(data.checkins);
    assertEquals(data.checkins.length, 1);
    
    const checkin = data.checkins[0];
    assertEquals(checkin.author.did, "did:plc:user1");
    assertEquals(checkin.author.displayName, "Test User 1");
    assertEquals(checkin.author.avatar, "https://cdn.bsky.app/avatar/user1");
  } finally {
    restore();
    if (sqliteStub) sqliteStub.restore();
  }
});

Deno.test("API - Resolves missing profiles on demand", async () => {
  mockSqlite.clear();
  
  // Ensure tables exist
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT,
      author_did TEXT,
      author_handle TEXT,
      text TEXT,
      created_at TEXT
    )
  `);
  
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS profile_cache_v1 (
      did TEXT PRIMARY KEY,
      handle TEXT,
      display_name TEXT,
      avatar TEXT,
      fetched_at TEXT,
      updated_at TEXT
    )
  `);
  
  // Insert check-in without cached profile
  await mockSqlite.execute(
    `INSERT INTO checkins_v1 
     (id, uri, author_did, author_handle, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "checkin3",
      "at://did:plc:user3/app.dropanchor.checkin/checkin3",
      "did:plc:user3",
      "did:plc:user3", // No resolved handle
      "New check-in!",
      "2025-01-18T11:00:00Z",
    ]
  );
  
  const _fetchStub = setupProfileFetchMock();
  let fetchCalled = false;
  const originalFetch = fetchStub.original;
  fetchStub.returns = (url: string) => {
    if (url.includes("did:plc:user3")) {
      fetchCalled = true;
    }
    return originalFetch.call(globalThis, url);
  };
  
  try {
    const request = new Request("https://test.com/global");
    const response = await anchorAPI(request);
    
    assertEquals(response.status, 200);
    
    const data = await response.json();
    const checkin = data.checkins[0];
    
    // Should have resolved the profile
    assertEquals(fetchCalled, true);
    assertEquals(checkin.author.handle, "user3.bsky.social");
    assertEquals(checkin.author.displayName, "New User 3");
    assertEquals(checkin.author.avatar, "https://cdn.bsky.app/avatar/user3");
    
    // Check it was cached
    const cached = await mockSqlite.execute(
      "SELECT * FROM profile_cache_v1 WHERE did = ?",
      ["did:plc:user3"]
    );
    assertEquals(cached.rows?.length, 1);
  } finally {
    restore();
    if (sqliteStub) sqliteStub.restore();
  }
});

Deno.test("API - Following feed includes profile data", async () => {
  await createTestCheckins();
  
  // Set up following relationship
  await mockSqlite.execute(
    `INSERT INTO user_follows_v1 (follower_did, following_did)
     VALUES (?, ?)`,
    ["did:plc:follower", "did:plc:user1"]
  );
  
  const _fetchStub = setupProfileFetchMock();
  
  try {
    const request = new Request("https://test.com/following?user=did:plc:follower");
    const response = await anchorAPI(request);
    
    assertEquals(response.status, 200);
    
    const data = await response.json();
    assertExists(data.checkins);
    assertEquals(data.checkins.length, 1);
    
    const checkin = data.checkins[0];
    assertEquals(checkin.author.did, "did:plc:user1");
    assertEquals(checkin.author.displayName, "Test User 1");
    assertEquals(checkin.author.avatar, "https://cdn.bsky.app/avatar/user1");
  } finally {
    restore();
    if (sqliteStub) sqliteStub.restore();
  }
});

Deno.test("API - Handles profiles without display name or avatar", async () => {
  mockSqlite.clear();
  
  // Ensure tables exist
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT,
      author_did TEXT,
      author_handle TEXT,
      text TEXT,
      created_at TEXT
    )
  `);
  
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS profile_cache_v1 (
      did TEXT PRIMARY KEY,
      handle TEXT,
      display_name TEXT,
      avatar TEXT,
      fetched_at TEXT,
      updated_at TEXT
    )
  `);
  
  // Insert check-in and minimal profile
  await mockSqlite.execute(
    `INSERT INTO checkins_v1 
     (id, uri, author_did, author_handle, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "checkin4",
      "at://did:plc:minimal/app.dropanchor.checkin/checkin4",
      "did:plc:minimal",
      "minimal.bsky.social",
      "Minimal profile test",
      "2025-01-18T12:00:00Z",
    ]
  );
  
  await mockSqlite.execute(
    `INSERT INTO profile_cache_v1 
     (did, handle, fetched_at)
     VALUES (?, ?, ?)`,
    [
      "did:plc:minimal",
      "minimal.bsky.social",
      new Date().toISOString(),
    ]
  );
  
  const _fetchStub = setupProfileFetchMock();
  
  try {
    const request = new Request("https://test.com/global");
    const response = await anchorAPI(request);
    
    const data = await response.json();
    const checkin = data.checkins[0];
    
    assertEquals(checkin.author.handle, "minimal.bsky.social");
    assertEquals(checkin.author.displayName, undefined);
    assertEquals(checkin.author.avatar, undefined);
  } finally {
    restore();
    if (sqliteStub) sqliteStub.restore();
  }
});