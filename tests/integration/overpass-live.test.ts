import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { OverpassService } from "../../backend/services/overpass-service.ts";
import { Place } from "../../backend/models/place-models.ts";

// These tests hit the live Overpass API.
// They verify that our logic works with real-world data and that the API is reachable.
// We use specific coordinates/venues that are unlikely to change significantly.

const service = new OverpassService({
  baseURL: "https://overpass-api.de/api/interpreter", // Use public instance for tests
  timeout: 15000,
});

// Helper to create a dummy place at a location
function createPlace(name: string, lat: number, lon: number): Place {
  return {
    id: "node:0",
    elementType: "node",
    elementId: 0,
    name,
    latitude: lat,
    longitude: lon,
    tags: {},
    address: {
      $type: "community.lexicon.location.address",
      name,
    },
    icon: "📍",
  };
}

Deno.test({
  name: "Integration: OverpassService - Resolves Admin Boundaries (NL)",
  fn: async () => {
    // User Location, NL
    const place = createPlace("User Location", 52.07417, 4.35972);
    const enhanced = await service.getEnhancedAddress(place);

    assertEquals(enhanced.country, "NL");
    assertEquals(enhanced.region, "Zuid-Holland");
    // Locality might be Leidschendam-Voorburg or similar depending on exact point
    assertExists(enhanced.locality);
  },
});

Deno.test({
  name: "Integration: OverpassService - Resolves Admin Boundaries (UK)",
  fn: async () => {
    // Stonehenge, UK
    const place = createPlace("Stonehenge", 51.1789, -1.8262);
    const enhanced = await service.getEnhancedAddress(place);

    assertEquals(enhanced.country, "GB");
    assertEquals(enhanced.region, "Wiltshire"); // Level 6
  },
});

Deno.test({
  name: "Integration: OverpassService - Resolves Admin Boundaries (JP)",
  fn: async () => {
    // Tokyo Tower, JP
    const place = createPlace("Tokyo Tower", 35.6586, 139.7454);
    const enhanced = await service.getEnhancedAddress(place);

    assertEquals(enhanced.country, "JP");
    assertEquals(enhanced.region, "東京都"); // Tokyo Metropolis
    assertEquals(enhanced.locality, "港区"); // Minato City (Level 7)
  },
});

Deno.test({
  name: "Integration: OverpassService - Resolves Admin Boundaries (US)",
  fn: async () => {
    // Empire State Building, US
    const place = createPlace("Empire State Building", 40.748817, -73.985428);
    const enhanced = await service.getEnhancedAddress(place);

    assertEquals(enhanced.country, "US");
    assertEquals(enhanced.region, "New York"); // State
    // OSM can be tricky here, sometimes it picks Manhattan (borough) as locality if Level 8 is missing or weird
    // We accept either for this test
    if (enhanced.locality !== "New York" && enhanced.locality !== "Manhattan") {
      assertEquals(enhanced.locality, "New York"); // Fail with expected message
    }
  },
});

Deno.test({
  name: "Integration: OverpassService - Resolves Full Venue Address",
  fn: async () => {
    // Search for Empire State Building
    const places = await service.findNearbyPlaces(
      { latitude: 40.748817, longitude: -73.985428 },
      100
    );

    console.log(
      "Found places:",
      places.map((p) => p.name)
    );

    // Find any place that has street address info
    // This is more robust than looking for a specific venue which might change categories/tags
    const placeWithAddress = places.find(
      (p) =>
        p.address.street !== undefined || p.address.postalCode !== undefined
    );

    if (placeWithAddress) {
      console.log(`✅ Verified address for: ${placeWithAddress.name}`);
      console.log(placeWithAddress.address);
    }

    assertExists(
      placeWithAddress,
      "Should find at least one place with street address in this dense area"
    );
  },
});
