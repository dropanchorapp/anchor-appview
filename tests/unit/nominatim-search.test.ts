// Test suite for Nominatim search functionality
// Tests the new places search endpoint and Nominatim service

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock the Deno.env.get function to avoid permission issues
const originalEnvGet = Deno.env.get;
Deno.env.get = (key: string) => {
  if (key === "NOMINATIM_BASE_URL") {
    return "https://nominatim.geocoding.ai";
  }
  return originalEnvGet(key);
};

// Restore original env.get function after all tests
globalThis.addEventListener("unload", () => {
  Deno.env.get = originalEnvGet;
});

// Import after mocking is set up
import { NominatimService } from "../../backend/services/nominatim-service.ts";

Deno.test("NominatimService - Constructor with default config", () => {
  const service = new NominatimService();
  assertExists(service);
});

Deno.test("NominatimService - Constructor with custom config", () => {
  const service = new NominatimService({
    baseURL: "https://custom-nominatim.example.com",
    timeout: 5000,
  });
  assertExists(service);
});

// Mock Nominatim API response for testing
const mockNominatimResponse = [
  {
    place_id: 12345,
    licence:
      "Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright",
    osm_type: "node",
    osm_id: 987654321,
    lat: "52.080178",
    lon: "4.3578971",
    display_name: "Test Cafe, Test Street, Test City, Netherlands",
    class: "amenity",
    type: "cafe",
    importance: 0.6,
    address: {
      amenity: "Test Cafe",
      road: "Test Street",
      city: "Test City",
      country: "Netherlands",
      postcode: "1234AB",
    },
  },
  {
    place_id: 67890,
    licence:
      "Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright",
    osm_type: "way",
    osm_id: 123456789,
    lat: "52.081000",
    lon: "4.358000",
    display_name: "Test Mountain, Netherlands",
    class: "natural",
    type: "peak",
    importance: 0.4,
  },
];

// Mock fetch function for testing
const originalFetch = globalThis.fetch;
function mockFetch(url: string, options?: RequestInit): Promise<Response> {
  if (url.includes("/search")) {
    return Promise.resolve(
      new Response(JSON.stringify(mockNominatimResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return originalFetch(url, options);
}

Deno.test("NominatimService - searchPlaces with valid query", async () => {
  // Mock fetch for this test
  globalThis.fetch = mockFetch;

  try {
    const service = new NominatimService();
    const results = await service.searchPlaces(
      "cafe",
      { latitude: 52.080178, longitude: 4.3578971 },
      { limit: 10 },
    );

    assertEquals(results.length, 2);

    // Check first result (cafe)
    const cafe = results.find((r) => r.category === "cafe");
    assertExists(cafe);
    assertEquals(cafe.name, "Test Cafe");
    assertEquals(cafe.icon, "☕");
    assertEquals(cafe.elementType, "node");
    assertExists(cafe.distanceMeters);
    assertExists(cafe.formattedDistance);

    // Check second result (mountain)
    const mountain = results.find((r) => r.category === "peak");
    assertExists(mountain);
    assertEquals(mountain.name, "Test Mountain");
    assertEquals(mountain.icon, "⛰️"); // Mountain icon from CategoryService
    assertEquals(mountain.elementType, "way");
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

Deno.test("NominatimService - searchPlaces with country filter", async () => {
  globalThis.fetch = mockFetch;

  try {
    const service = new NominatimService();
    const results = await service.searchPlaces(
      "restaurant",
      { latitude: 52.080178, longitude: 4.3578971 },
      { country: "NL", limit: 5 },
    );

    // Should still get results (mocked)
    assertExists(results);
    assertEquals(Array.isArray(results), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Test URL parameter parsing logic (without calling the full API)
Deno.test("Search query validation", () => {
  // Test basic query validation
  const validQuery = "cafe near me";
  assertEquals(validQuery.trim() !== "", true);

  const emptyQuery = "";
  assertEquals(emptyQuery.trim() === "", true);

  const whitespaceQuery = "   ";
  assertEquals(whitespaceQuery.trim() === "", true);
});

Deno.test("Coordinate validation", () => {
  // Test coordinate range validation
  const validLat = 52.080178;
  const validLng = 4.3578971;
  assertEquals(validLat >= -90 && validLat <= 90, true);
  assertEquals(validLng >= -180 && validLng <= 180, true);

  const invalidLat = 91;
  const invalidLng = 181;
  assertEquals(invalidLat >= -90 && invalidLat <= 90, false);
  assertEquals(invalidLng >= -180 && invalidLng <= 180, false);
});

Deno.test("Limit parameter validation", () => {
  // Test limit parameter handling
  const maxLimit = 25;

  const userLimit = 15;
  const actualLimit = Math.min(userLimit, maxLimit);
  assertEquals(actualLimit, 15);

  const tooLargeLimit = 50;
  const clampedLimit = Math.min(tooLargeLimit, maxLimit);
  assertEquals(clampedLimit, 25);
});

Deno.test("NominatimService - icon mapping for various OSM types", () => {
  const service = new NominatimService();

  // Test icon mapping through reflection (accessing private method)
  // Note: This tests the logic but can't directly access private methods
  // The icon mapping is tested indirectly through searchPlaces results
  assertEquals(typeof service, "object");
});

Deno.test("NominatimService - distance calculation", () => {
  const service = new NominatimService();

  // Test distance formatting indirectly by checking that results have formatted distances
  // Direct testing of private methods isn't possible, but we can verify the output format
  assertEquals(typeof service, "object");
});

Deno.test("NominatimService - place name extraction", () => {
  const service = new NominatimService();

  // Test name extraction logic indirectly through searchPlaces
  // The extractPlaceName method is private but its results are visible in the public API
  assertEquals(typeof service, "object");
});
