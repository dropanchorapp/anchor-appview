// Unit tests for checkin creation business logic
// Tests input sanitization, coordinate validation, and address construction

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// Test the coordinate sanitization and validation logic
function sanitizePlaceInput(input: any): {
  name: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
  valid: boolean;
  error?: string;
} {
  // Convert string coordinates to numbers
  const latitude = typeof input.latitude === "string"
    ? parseFloat(input.latitude)
    : input.latitude;
  const longitude = typeof input.longitude === "string"
    ? parseFloat(input.longitude)
    : input.longitude;

  // Validate coordinates
  if (
    typeof latitude !== "number" || typeof longitude !== "number" ||
    isNaN(latitude) || isNaN(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    return {
      name: input.name || "",
      latitude,
      longitude,
      tags: input.tags || {},
      valid: false,
      error: "Invalid coordinates",
    };
  }

  return {
    name: input.name || "",
    latitude,
    longitude,
    tags: input.tags || {},
    valid: true,
  };
}

// Test address duplication prevention logic
function preventNameLocalityDuplication(
  address: { name?: string; locality?: string },
): { name?: string; locality?: string } {
  if (address.locality === address.name) {
    return { ...address, locality: undefined };
  }
  return address;
}

// Test StrongRef format validation
function isValidStrongRef(ref: any): boolean {
  return !!(
    ref &&
    typeof ref.uri === "string" &&
    typeof ref.cid === "string" &&
    ref.uri.startsWith("at://") &&
    ref.uri.includes("/community.lexicon.location.address/") &&
    ref.cid.length > 0
  );
}

// Test rkey extraction from AT URI
function extractRkey(uri: string): string | null {
  try {
    const parts = uri.split("/");
    const rkey = parts[parts.length - 1];
    return rkey && rkey.length > 0 ? rkey : null;
  } catch {
    return null;
  }
}

Deno.test("Checkin Creation - Sanitize string coordinates to numbers", () => {
  const input = {
    name: "Test Cafe",
    latitude: "40.7128",
    longitude: "-74.0060",
    tags: { amenity: "cafe" },
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, true);
  assertEquals(result.latitude, 40.7128);
  assertEquals(result.longitude, -74.0060);
  assertEquals(typeof result.latitude, "number");
  assertEquals(typeof result.longitude, "number");
});

Deno.test("Checkin Creation - Accept numeric coordinates", () => {
  const input = {
    name: "Test Cafe",
    latitude: 40.7128,
    longitude: -74.0060,
    tags: { amenity: "cafe" },
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, true);
  assertEquals(result.latitude, 40.7128);
  assertEquals(result.longitude, -74.0060);
});

Deno.test("Checkin Creation - Reject invalid latitude (> 90)", () => {
  const input = {
    name: "Test Cafe",
    latitude: 91,
    longitude: 0,
    tags: {},
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid coordinates");
});

Deno.test("Checkin Creation - Reject invalid latitude (< -90)", () => {
  const input = {
    name: "Test Cafe",
    latitude: -91,
    longitude: 0,
    tags: {},
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid coordinates");
});

Deno.test("Checkin Creation - Reject invalid longitude (> 180)", () => {
  const input = {
    name: "Test Cafe",
    latitude: 0,
    longitude: 181,
    tags: {},
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid coordinates");
});

Deno.test("Checkin Creation - Reject invalid longitude (< -180)", () => {
  const input = {
    name: "Test Cafe",
    latitude: 0,
    longitude: -181,
    tags: {},
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid coordinates");
});

Deno.test("Checkin Creation - Reject NaN latitude from invalid string", () => {
  const input = {
    name: "Test Cafe",
    latitude: "not-a-number",
    longitude: 0,
    tags: {},
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, false);
  assertEquals(isNaN(result.latitude), true);
});

Deno.test("Checkin Creation - Reject NaN longitude from invalid string", () => {
  const input = {
    name: "Test Cafe",
    latitude: 0,
    longitude: "not-a-number",
    tags: {},
  };

  const result = sanitizePlaceInput(input);

  assertEquals(result.valid, false);
  assertEquals(isNaN(result.longitude), true);
});

Deno.test("Checkin Creation - Accept boundary coordinates (lat: 90, -90)", () => {
  const northPole = sanitizePlaceInput({
    name: "North Pole",
    latitude: 90,
    longitude: 0,
    tags: {},
  });
  assertEquals(northPole.valid, true);

  const southPole = sanitizePlaceInput({
    name: "South Pole",
    latitude: -90,
    longitude: 0,
    tags: {},
  });
  assertEquals(southPole.valid, true);
});

Deno.test("Checkin Creation - Accept boundary coordinates (lng: 180, -180)", () => {
  const westBoundary = sanitizePlaceInput({
    name: "West",
    latitude: 0,
    longitude: -180,
    tags: {},
  });
  assertEquals(westBoundary.valid, true);

  const eastBoundary = sanitizePlaceInput({
    name: "East",
    latitude: 0,
    longitude: 180,
    tags: {},
  });
  assertEquals(eastBoundary.valid, true);
});

Deno.test("Checkin Creation - Prevent name/locality duplication", () => {
  const address = {
    name: "Central Park",
    locality: "Central Park", // Duplicate!
  };

  const result = preventNameLocalityDuplication(address);

  assertEquals(result.name, "Central Park");
  assertEquals(result.locality, undefined); // Should be removed
});

Deno.test("Checkin Creation - Preserve different name and locality", () => {
  const address = {
    name: "Central Park",
    locality: "New York",
  };

  const result = preventNameLocalityDuplication(address);

  assertEquals(result.name, "Central Park");
  assertEquals(result.locality, "New York");
});

Deno.test("Checkin Creation - Handle missing locality", () => {
  const address = {
    name: "Central Park",
  };

  const result = preventNameLocalityDuplication(address);

  assertEquals(result.name, "Central Park");
  assertEquals(result.locality, undefined);
});

Deno.test("Checkin Creation - Validate StrongRef format", () => {
  const validRef = {
    uri: "at://did:plc:test123/community.lexicon.location.address/3k2xyz",
    cid: "bafyreicv3pecq6fuua22xcoguxep76otivb33nlaofzl76fpagczo5t5jm",
  };

  assertEquals(isValidStrongRef(validRef), true);
});

Deno.test("Checkin Creation - Reject StrongRef without uri", () => {
  const invalidRef = {
    cid: "bafyreicv3pecq6fuua22xcoguxep76otivb33nlaofzl76fpagczo5t5jm",
  };

  assertEquals(isValidStrongRef(invalidRef), false);
});

Deno.test("Checkin Creation - Reject StrongRef without cid", () => {
  const invalidRef = {
    uri: "at://did:plc:test123/community.lexicon.location.address/3k2xyz",
  };

  assertEquals(isValidStrongRef(invalidRef), false);
});

Deno.test("Checkin Creation - Reject StrongRef with wrong collection", () => {
  const invalidRef = {
    uri: "at://did:plc:test123/app.dropanchor.checkin/3k2xyz", // Wrong collection
    cid: "bafyreicv3pecq6fuua22xcoguxep76otivb33nlaofzl76fpagczo5t5jm",
  };

  assertEquals(isValidStrongRef(invalidRef), false);
});

Deno.test("Checkin Creation - Reject StrongRef with invalid AT URI format", () => {
  const invalidRef = {
    uri: "https://example.com/address/3k2xyz", // Not an AT URI
    cid: "bafyreicv3pecq6fuua22xcoguxep76otivb33nlaofzl76fpagczo5t5jm",
  };

  assertEquals(isValidStrongRef(invalidRef), false);
});

Deno.test("Checkin Creation - Extract rkey from AT URI", () => {
  const uri =
    "at://did:plc:test123/app.dropanchor.checkin/3k2xyzhello1234567890";
  const rkey = extractRkey(uri);

  assertEquals(rkey, "3k2xyzhello1234567890");
});

Deno.test("Checkin Creation - Extract rkey from address URI", () => {
  const uri = "at://did:plc:test123/community.lexicon.location.address/3k2abc";
  const rkey = extractRkey(uri);

  assertEquals(rkey, "3k2abc");
});

Deno.test("Checkin Creation - Handle malformed URI for rkey extraction", () => {
  const uri = "not-a-valid-uri";
  const rkey = extractRkey(uri);

  assertExists(rkey); // Should still try to extract
});

Deno.test("Checkin Creation - Handle empty URI for rkey extraction", () => {
  const uri = "";
  const rkey = extractRkey(uri);

  assertEquals(rkey, null);
});

Deno.test("Checkin Creation - Handle URI without trailing slash", () => {
  const uri = "at://did:plc:test123/app.dropanchor.checkin/";
  const rkey = extractRkey(uri);

  assertEquals(rkey, null); // Empty rkey should be invalid
});
