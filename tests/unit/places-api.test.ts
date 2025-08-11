// Test suite for places API endpoint
// Tests the TypeScript port of OSM/Overpass place discovery

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { OverpassService } from "../../backend/services/overpass-service.ts";
import { PlaceCategorization } from "../../backend/utils/place-categorization.ts";
import { PlaceCategoryGroup } from "../../backend/models/place-models.ts";

Deno.test("PlaceCategorization - Category mapping", () => {
  // Test category group mapping
  assertEquals(
    PlaceCategorization.getCategoryGroup("amenity", "cafe"),
    PlaceCategoryGroup.FOOD_AND_DRINK,
  );

  assertEquals(
    PlaceCategorization.getCategoryGroup("leisure", "climbing"),
    PlaceCategoryGroup.SPORTS,
  );

  assertEquals(
    PlaceCategorization.getCategoryGroup("shop", "supermarket"),
    PlaceCategoryGroup.FOOD_AND_DRINK,
  );

  assertEquals(
    PlaceCategorization.getCategoryGroup("tourism", "hotel"),
    PlaceCategoryGroup.ACCOMMODATION,
  );
});

Deno.test("PlaceCategorization - Icon mapping", () => {
  assertEquals(PlaceCategorization.getIcon("amenity", "cafe"), "☕");
  assertEquals(PlaceCategorization.getIcon("amenity", "restaurant"), "🍽️");
  assertEquals(PlaceCategorization.getIcon("leisure", "climbing"), "🧗‍♂️");
  assertEquals(PlaceCategorization.getIcon("shop", "supermarket"), "🛒");
  assertEquals(PlaceCategorization.getIcon("unknown", "tag"), "📍");
});

Deno.test("PlaceCategorization - Get all categories", () => {
  const categories = PlaceCategorization.getAllCategories();

  // Should have categories from all tag types
  assertEquals(categories.includes("amenity=cafe"), true);
  assertEquals(categories.includes("leisure=climbing"), true);
  assertEquals(categories.includes("shop=supermarket"), true);
  assertEquals(categories.includes("tourism=hotel"), true);

  // Should be sorted
  const sorted = [...categories].sort();
  assertEquals(categories, sorted);
});

Deno.test("PlaceCategorization - Prioritized categories", () => {
  const prioritized = PlaceCategorization.getPrioritizedCategories();

  // Should include most common places
  assertEquals(prioritized.includes("amenity=restaurant"), true);
  assertEquals(prioritized.includes("amenity=cafe"), true);
  assertEquals(prioritized.includes("leisure=climbing"), true);

  // Should be reasonable number (not too many)
  assertEquals(prioritized.length < 20, true);
});

Deno.test("PlaceCategorization - Category objects with IDs", () => {
  const categoryObjects = PlaceCategorization.getAllCategoryObjects();

  // Should have IDs in correct format
  const cafeCategory = categoryObjects.find((c) => c.id === "amenity_cafe");
  assertExists(cafeCategory);
  assertEquals(cafeCategory.name, "Cafe");
  assertEquals(cafeCategory.icon, "☕");
  assertEquals(cafeCategory.osmTag, "amenity=cafe");
  assertEquals(cafeCategory.group, PlaceCategoryGroup.FOOD_AND_DRINK);
});

Deno.test("OverpassService - Distance calculation", () => {
  const service = new OverpassService();

  // Access private method via any cast for testing
  const calculateDistance = (service as any).calculateDistance;

  // Test known distance (approximately)
  const distance = calculateDistance(37.7749, -122.4194, 37.7849, -122.4094);

  // Should be roughly 1.4km between these SF coordinates
  assertEquals(Math.abs(distance - 1400) < 100, true);
});

Deno.test("OverpassService - Distance formatting", () => {
  const service = new OverpassService();

  // Access private method
  const formatDistance = (service as any).formatDistance;

  assertEquals(formatDistance(45), "45m");
  assertEquals(formatDistance(999), "999m");
  assertEquals(formatDistance(1000), "1.0km");
  assertEquals(formatDistance(1500), "1.5km");
});

// Mock test for OverpassService (no external API calls)
Deno.test("OverpassService - Mock API query", async () => {
  // Mock the OverpassService to avoid external API calls
  class MockOverpassService {
    findNearbyPlacesWithDistance(
      _coordinate: { latitude: number; longitude: number },
      _radiusMeters: number,
    ) {
      // Return mock places data
      return [
        {
          id: "node:123456789",
          elementType: "node" as const,
          elementId: 123456789,
          name: "Golden Gate Bridge",
          latitude: 37.8199,
          longitude: -122.4783,
          tags: {
            "name": "Golden Gate Bridge",
            "man_made": "bridge",
          },
          address: {
            $type: "community.lexicon.location.address" as const,
            name: "Golden Gate Bridge",
            locality: "San Francisco",
            region: "CA",
            country: "US",
          },
          category: "bridge",
          categoryGroup: undefined,
          icon: "🌉",
          distanceMeters: 50,
          formattedDistance: "50m",
        },
        {
          id: "node:987654321",
          elementType: "node" as const,
          elementId: 987654321,
          name: "Test Cafe",
          latitude: 37.8200,
          longitude: -122.4784,
          tags: {
            "name": "Test Cafe",
            "amenity": "cafe",
          },
          address: {
            $type: "community.lexicon.location.address" as const,
            name: "Test Cafe",
            street: "123 Test St",
            locality: "San Francisco",
            region: "CA",
            country: "US",
          },
          category: "cafe",
          categoryGroup: undefined,
          icon: "☕",
          distanceMeters: 150,
          formattedDistance: "150m",
        },
      ];
    }
  }

  const mockService = new MockOverpassService();
  const coordinate = { latitude: 37.8199, longitude: -122.4783 };

  const places = await mockService.findNearbyPlacesWithDistance(
    coordinate,
    1000,
  );

  // Test that mock data is returned correctly
  assertEquals(places.length, 2);
  assertEquals(places[0].name, "Golden Gate Bridge");
  assertEquals(places[0].distanceMeters, 50);
  assertEquals(places[1].name, "Test Cafe");
  assertEquals(places[1].distanceMeters, 150);

  // Test that places are properly structured
  for (const place of places) {
    assertExists(place.id);
    assertExists(place.name);
    assertExists(place.latitude);
    assertExists(place.longitude);
    assertExists(place.address);
    assertExists(place.address.name);
    assertExists(place.distanceMeters);
    assertExists(place.formattedDistance);
    assertEquals(typeof place.distanceMeters, "number");
    assertEquals(place.distanceMeters >= 0, true);
  }
});
