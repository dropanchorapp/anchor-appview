import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Haversine distance calculation (from the API code)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Deno.test("Spatial - calculateDistance same point", () => {
  const distance = calculateDistance(40.7128, -74.0060, 40.7128, -74.0060);
  assertEquals(distance, 0);
});

Deno.test("Spatial - calculateDistance New York to Los Angeles", () => {
  // NYC: 40.7128° N, 74.0060° W
  // LA: 34.0522° N, 118.2437° W
  const distance = calculateDistance(40.7128, -74.0060, 34.0522, -118.2437);
  
  // Expected distance is approximately 3944 km
  assertAlmostEquals(distance, 3944, 50); // Allow 50km tolerance
});

Deno.test("Spatial - calculateDistance short distance", () => {
  // Two points in Manhattan, approximately 1km apart
  const lat1 = 40.7589; // Times Square
  const lng1 = -73.9851;
  const lat2 = 40.7505; // Empire State Building  
  const lng2 = -73.9934;
  
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  
  // Should be approximately 1.2 km
  assertAlmostEquals(distance, 1.2, 0.5);
});

Deno.test("Spatial - calculateDistance across equator", () => {
  // Test crossing the equator
  const distance = calculateDistance(10, 0, -10, 0);
  
  // 20 degrees of latitude ≈ 2222 km
  assertAlmostEquals(distance, 2222, 50);
});

Deno.test("Spatial - calculateDistance across 180th meridian", () => {
  // Test crossing the international date line
  const distance = calculateDistance(0, 179, 0, -179);
  
  // Should be about 222 km (2 degrees of longitude at equator)
  assertAlmostEquals(distance, 222, 50);
});

Deno.test("Spatial - distance filtering logic", () => {
  interface TestCheckin {
    id: string;
    latitude: number;
    longitude: number;
    distance?: number;
  }

  const centerLat = 40.7128;
  const centerLng = -74.0060;
  const radius = 5; // 5km radius

  const checkins: TestCheckin[] = [
    { id: "nearby1", latitude: 40.7150, longitude: -74.0080 }, // ~250m away
    { id: "nearby2", latitude: 40.7200, longitude: -74.0100 }, // ~1km away
    { id: "far1", latitude: 40.8000, longitude: -74.0000 },    // ~10km away
    { id: "far2", latitude: 41.0000, longitude: -74.0000 },    // ~32km away
  ];

  // Calculate distances and filter
  const nearbyCheckins = checkins
    .map(checkin => ({
      ...checkin,
      distance: calculateDistance(centerLat, centerLng, checkin.latitude, checkin.longitude)
    }))
    .filter(checkin => checkin.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  // Should have 2 nearby checkins
  assertEquals(nearbyCheckins.length, 2);
  assertEquals(nearbyCheckins[0].id, "nearby1");
  assertEquals(nearbyCheckins[1].id, "nearby2");
  
  // Verify distances are calculated and within radius
  assertEquals(nearbyCheckins[0].distance! < radius, true);
  assertEquals(nearbyCheckins[1].distance! < radius, true);
  
  // Verify sorting by distance
  assertEquals(nearbyCheckins[0].distance! <= nearbyCheckins[1].distance!, true);
});

Deno.test("Spatial - coordinate validation", () => {
  // Test invalid coordinates
  const invalidLat = calculateDistance(91, 0, 0, 0); // Latitude > 90
  assertEquals(isNaN(invalidLat), false); // Should still calculate, even if unrealistic
  
  const invalidLng = calculateDistance(0, 181, 0, 0); // Longitude > 180
  assertEquals(isNaN(invalidLng), false); // Should still calculate
});

Deno.test("Spatial - precision rounding", () => {
  const distance = calculateDistance(40.7128, -74.0060, 40.7130, -74.0062);
  const rounded = Math.round(distance * 100) / 100; // 2 decimal places
  
  // Should be a very small distance, properly rounded
  assertEquals(typeof rounded, "number");
  assertEquals(rounded >= 0, true);
  assertEquals(rounded < 1, true); // Should be less than 1km
});

Deno.test("Spatial - boundary conditions", () => {
  // Test at the poles
  const northPole1 = calculateDistance(90, 0, 90, 180);
  assertAlmostEquals(northPole1, 0, 0.001); // All points at north pole are the same (within 1m)
  
  // Test at extreme longitudes
  const extremeLng = calculateDistance(0, -180, 0, 180);
  assertAlmostEquals(extremeLng, 0, 0.001); // -180 and 180 longitude are the same meridian (within 1m)
});