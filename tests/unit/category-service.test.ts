// Test suite for CategoryService
// Tests centralized category system with metadata and use-case functions

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { CategoryService } from "../../backend/services/category-service.ts";
import { PlaceCategoryGroup } from "../../backend/models/place-models.ts";

Deno.test("CategoryService - Use case specific methods", () => {
  // Default search categories (when user doesn't specify)
  const defaultSearch = CategoryService.getDefaultSearchCategories();
  assertEquals(defaultSearch.includes("amenity=restaurant"), true);
  assertEquals(defaultSearch.includes("amenity=cafe"), true);
  assertEquals(defaultSearch.includes("leisure=fitness_centre"), true);
  assertEquals(defaultSearch.includes("amenity=toilets"), false); // Should not include on-demand categories

  // Socially relevant categories
  const social = CategoryService.getSociallyRelevantCategories();
  assertEquals(social.includes("amenity=restaurant"), true);
  assertEquals(social.includes("tourism=attraction"), true);
  assertEquals(social.includes("amenity=hospital"), false); // Not socially relevant

  console.log(
    `Default search: ${defaultSearch.length}, Social: ${social.length}`,
  );
});

Deno.test("CategoryService - Address strategy methods", () => {
  // Venue address strategy (skip expensive geocoding)
  assertEquals(
    CategoryService.shouldUseVenueAddressStrategy("restaurant"),
    true,
  );
  assertEquals(CategoryService.shouldUseVenueAddressStrategy("cafe"), true);
  assertEquals(CategoryService.shouldUseVenueAddressStrategy("bank"), true);
  assertEquals(CategoryService.shouldUseVenueAddressStrategy("park"), false);
  assertEquals(CategoryService.shouldUseVenueAddressStrategy("unknown"), false);

  // Geographic address strategy (use Nominatim)
  assertEquals(
    CategoryService.shouldUseGeographicAddressStrategy("park"),
    true,
  );
  assertEquals(
    CategoryService.shouldUseGeographicAddressStrategy("playground"),
    true,
  );
  assertEquals(
    CategoryService.shouldUseGeographicAddressStrategy("attraction"),
    true,
  );
  assertEquals(
    CategoryService.shouldUseGeographicAddressStrategy("restaurant"),
    false,
  );
  assertEquals(
    CategoryService.shouldUseGeographicAddressStrategy("unknown"),
    false,
  );
});

Deno.test("CategoryService - Backward compatibility", () => {
  // Should maintain all existing PlaceCategorization methods
  const allCategories = CategoryService.getAllCategories();
  const prioritized = CategoryService.getPrioritizedCategories();

  assertEquals(allCategories.length > 40, true);
  assertEquals(prioritized.length > 20, true);
  assertEquals(prioritized.length < allCategories.length, true);

  // Category group mapping
  assertEquals(
    CategoryService.getCategoryGroup("amenity", "cafe"),
    PlaceCategoryGroup.FOOD_AND_DRINK,
  );
  assertEquals(
    CategoryService.getCategoryGroup("leisure", "fitness_centre"),
    PlaceCategoryGroup.SPORTS,
  );
  assertEquals(CategoryService.getCategoryGroup("unknown", "value"), null);

  // Icon mapping
  assertEquals(CategoryService.getIcon("amenity", "cafe"), "☕");
  assertEquals(CategoryService.getIcon("amenity", "restaurant"), "🍽️");
  assertEquals(CategoryService.getIcon("unknown", "value"), "📍");

  // Category objects
  const objects = CategoryService.getAllCategoryObjects();
  assertEquals(objects.length, allCategories.length);

  const cafeCategory = objects.find((obj) => obj.id === "amenity_cafe");
  assertExists(cafeCategory);
  assertEquals(cafeCategory.name, "Cafe");
  assertEquals(cafeCategory.icon, "☕");
  assertEquals(cafeCategory.group, PlaceCategoryGroup.FOOD_AND_DRINK);

  // Category by ID
  const cafeById = CategoryService.getCategoryById("amenity_cafe");
  assertExists(cafeById);
  assertEquals(cafeById.id, "amenity_cafe");
  assertEquals(cafeById.name, "Cafe");

  assertEquals(CategoryService.getCategoryById("invalid"), null);
  assertEquals(CategoryService.getCategoryById(""), null);
});

Deno.test("CategoryService - Category definitions integrity", () => {
  const definitions = CategoryService.getAllCategoryDefinitions();

  // Should have reasonable number of categories
  assertEquals(definitions.length > 40, true);
  assertEquals(definitions.length < 200, true);

  for (const def of definitions) {
    // Required fields
    assertExists(def.tag);
    assertExists(def.value);
    assertExists(def.group);
    assertExists(def.icon);
    assertExists(def.metadata);

    // Metadata validation
    assertEquals(typeof def.metadata.includeInDefaultSearch, "boolean");
    assertEquals(
      ["venue", "geographic", "standard"].includes(
        def.metadata.addressStrategy,
      ),
      true,
    );
    assertEquals(typeof def.metadata.socialRelevance, "boolean");

    // Tag/value format validation
    assertEquals(def.tag.length > 0, true);
    assertEquals(def.value.length > 0, true);
    assertEquals(def.icon.length > 0, true);

    // Group should be valid enum value
    assertEquals(Object.values(PlaceCategoryGroup).includes(def.group), true);
  }
});

Deno.test("CategoryService - Search inclusion distribution", () => {
  const definitions = CategoryService.getAllCategoryDefinitions();

  const includedCount =
    definitions.filter((def) => def.metadata.includeInDefaultSearch).length;
  const excludedCount =
    definitions.filter((def) => !def.metadata.includeInDefaultSearch).length;

  // Should have reasonable distribution
  assertEquals(
    includedCount > 15,
    true,
    "Should have substantial default search categories",
  );
  assertEquals(includedCount < 50, true, "Default search should be focused");
  assertEquals(
    excludedCount > 5,
    true,
    "Should have some on-demand categories",
  );

  console.log(
    `Search inclusion - Included: ${includedCount}, Excluded: ${excludedCount}`,
  );
});

Deno.test("CategoryService - Address strategy distribution", () => {
  const definitions = CategoryService.getAllCategoryDefinitions();

  const venueCount =
    definitions.filter((def) => def.metadata.addressStrategy === "venue")
      .length;
  const geographicCount =
    definitions.filter((def) => def.metadata.addressStrategy === "geographic")
      .length;
  const standardCount =
    definitions.filter((def) => def.metadata.addressStrategy === "standard")
      .length;

  // Should have reasonable distribution
  assertEquals(
    venueCount > 10,
    true,
    "Should have substantial venue categories",
  );
  assertEquals(geographicCount > 5, true, "Should have geographic categories");

  console.log(
    `Address strategy distribution - Venue: ${venueCount}, Geographic: ${geographicCount}, Standard: ${standardCount}`,
  );
});

Deno.test("CategoryService - Social relevance validation", () => {
  const definitions = CategoryService.getAllCategoryDefinitions();

  const socialCount =
    definitions.filter((def) => def.metadata.socialRelevance).length;
  const nonSocialCount =
    definitions.filter((def) => !def.metadata.socialRelevance).length;

  // Should have focused social categories
  assertEquals(
    socialCount > 15,
    true,
    "Should have substantial social categories",
  );
  assertEquals(socialCount < 45, true, "Social categories should be focused");
  assertEquals(nonSocialCount > 5, true, "Should have non-social categories");

  // Default search categories should mostly be social
  const defaultSearchSocial =
    definitions.filter((def) =>
      def.metadata.includeInDefaultSearch && def.metadata.socialRelevance
    ).length;
  const defaultSearchTotal =
    definitions.filter((def) => def.metadata.includeInDefaultSearch).length;

  assertEquals(
    defaultSearchSocial / defaultSearchTotal > 0.7,
    true,
    "Most default search categories should be social",
  );

  console.log(
    `Social relevance - Social: ${socialCount}, Non-social: ${nonSocialCount}, Default search social ratio: ${
      Math.round(defaultSearchSocial / defaultSearchTotal * 100)
    }%`,
  );
});
