import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { OverpassService } from "../../backend/services/overpass-service.ts";
import { Place } from "../../backend/models/place-models.ts";

Deno.test("OverpassService - filters religious boundaries", async () => {
  // Mock fetch
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (
      _input: Request | URL | string,
      _init?: RequestInit,
    ) => {
      let query = "";

      // The original code used 'input' and 'init' here.
      // To align with the instruction to prefix unused variables with underscore,
      // and assuming the intent is to make them unused in this specific mock,
      // we will use the prefixed versions.
      // However, the original logic *uses* these variables.
      // If the intent is to truly make them unused, the logic below would need to change.
      // For now, I will assume the instruction implies renaming the parameters
      // and the subsequent usage should also reflect this renaming to maintain functionality.
      // If the intent was to make them unused, the body would be different.
      // Given the instruction "Prefix unused variables with underscore" and the provided
      // code edit, I will rename the parameters and their usages within this specific mock.

      // If the instruction meant to make them truly unused, the body would be simplified.
      // As the instruction only specifies prefixing, and the original body uses them,
      // I will apply the prefix to the parameters and their subsequent usage to maintain
      // the original logic's functionality while adhering to the naming convention.

      if (_input instanceof Request) {
        query = await _input.text();
      } else if (_init?.body) {
        query = _init.body.toString();
      }

      // Mock the admin boundary query
      // The query is URL encoded in the body: "data=..."
      if (
        decodeURIComponent(query).includes("is_in") &&
        decodeURIComponent(query).includes("admin_level")
      ) {
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: "area",
                id: 1,
                tags: {
                  admin_level: "4",
                  boundary: "religious_administration",
                  name: "Kerkprovincie Utrecht",
                },
              },
              {
                type: "area",
                id: 2,
                tags: {
                  admin_level: "4",
                  boundary: "administrative",
                  name: "Zuid-Holland",
                },
              },
              {
                type: "area",
                id: 4,
                tags: {
                  admin_level: "4",
                  boundary: "census",
                  name: "Census Area",
                },
              },
              {
                type: "area",
                id: 3,
                tags: {
                  admin_level: "2",
                  boundary: "administrative",
                  name: "Nederland",
                  "ISO3166-1": "NL",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    };

    const service = new OverpassService();

    // Create a dummy place that needs enhancement (no region/country)
    const place: Place = {
      id: "node:123",
      elementType: "node",
      elementId: 123,
      name: "Test Place",
      latitude: 52.07417,
      longitude: 4.35972,
      tags: {},
      address: {
        $type: "community.lexicon.location.address",
        name: "Test Place",
        locality: "Test City",
        // Missing region and country
      },
      icon: "📍",
    };

    const enhanced = await service.getEnhancedAddress(place);

    console.log("Enhanced address:", enhanced);

    // Should pick Zuid-Holland, NOT Kerkprovincie Utrecht
    assertEquals(enhanced.region, "Zuid-Holland");
    assertEquals(enhanced.country, "NL");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test(
  "OverpassService - handles UK admin levels (Level 6 for Region)",
  async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (
        _input: Request | URL | string,
        _init?: RequestInit,
      ) => {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              elements: [
                {
                  type: "area",
                  id: 1,
                  tags: {
                    admin_level: "2",
                    boundary: "administrative",
                    name: "United Kingdom",
                    "ISO3166-1": "GB",
                  },
                },
                {
                  type: "area",
                  id: 2,
                  tags: {
                    admin_level: "4",
                    boundary: "administrative",
                    name: "Scotland", // Constituent country, not the region we want usually
                  },
                },
                {
                  type: "area",
                  id: 3,
                  tags: {
                    admin_level: "6",
                    boundary: "administrative",
                    name: "Highland", // The actual region/council area
                  },
                },
                {
                  type: "area",
                  id: 4,
                  tags: {
                    admin_level: "8",
                    boundary: "administrative",
                    name: "Inverness",
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        );
      };

      const service = new OverpassService();
      const place: Place = {
        id: "node:999",
        elementType: "node",
        elementId: 999,
        name: "Loch Ness",
        latitude: 57.3,
        longitude: -4.5,
        tags: {},
        address: {
          $type: "community.lexicon.location.address",
          name: "Loch Ness",
        },
        icon: "🌊",
      };

      const enhanced = await service.getEnhancedAddress(place);

      // For GB, we mapped Region to Level 6
      assertEquals(enhanced.region, "Highland");
      assertEquals(enhanced.country, "GB");
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
