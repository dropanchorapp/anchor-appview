// Comprehensive test suite for PlaceCategorization
// Tests system integrity across all 175+ categories efficiently

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PlaceCategorization } from "../../backend/utils/place-categorization.ts";
import { PlaceCategoryGroup } from "../../backend/models/place-models.ts";

Deno.test("PlaceCategorization - System integrity validation", () => {
  const allCategories = PlaceCategorization.getAllCategories();
  const allObjects = PlaceCategorization.getAllCategoryObjects();
  const prioritizedCategories = PlaceCategorization.getPrioritizedCategories();

  // Basic counts validation
  assertEquals(
    allCategories.length,
    allObjects.length,
    "Category count mismatch between getAllCategories() and getAllCategoryObjects()",
  );
  assertEquals(
    allCategories.length > 170,
    true,
    "Should have reasonable number of categories (170+)",
  );
  assertEquals(
    prioritizedCategories.length > 30 && prioritizedCategories.length < 50,
    true,
    "Prioritized categories should be focused subset",
  );

  // All categories should be properly formatted OSM tags
  for (const category of allCategories) {
    assertEquals(
      category.includes("="),
      true,
      `Category ${category} should contain '=' for OSM tag format`,
    );
    assertEquals(
      category.split("=").length,
      2,
      `Category ${category} should have exactly one '=' separator`,
    );
  }

  // All prioritized categories should exist in main categories
  const allCategoriesSet = new Set(allCategories);
  for (const prioritized of prioritizedCategories) {
    assertEquals(
      allCategoriesSet.has(prioritized),
      true,
      `Prioritized category ${prioritized} not found in all categories`,
    );
  }

  // Categories should be sorted
  const sortedCategories = [...allCategories].sort();
  assertEquals(
    allCategories,
    sortedCategories,
    "Categories should be sorted alphabetically",
  );
});

Deno.test("PlaceCategorization - Category object structure validation", () => {
  const allObjects = PlaceCategorization.getAllCategoryObjects();

  for (const categoryObj of allObjects) {
    // Required fields
    assertExists(categoryObj.id, `Category object missing id`);
    assertExists(
      categoryObj.name,
      `Category object ${categoryObj.id} missing name`,
    );
    assertExists(
      categoryObj.icon,
      `Category object ${categoryObj.id} missing icon`,
    );
    assertExists(
      categoryObj.group,
      `Category object ${categoryObj.id} missing group`,
    );
    assertExists(
      categoryObj.osmTag,
      `Category object ${categoryObj.id} missing osmTag`,
    );

    // ID format validation (should be tag_value, may have multiple underscores in value)
    assertEquals(
      categoryObj.id.includes("_"),
      true,
      `Category ID ${categoryObj.id} should contain underscore`,
    );
    assertEquals(
      categoryObj.id.split("_").length >= 2,
      true,
      `Category ID ${categoryObj.id} should have at least one underscore`,
    );

    // OSM tag format validation
    assertEquals(
      categoryObj.osmTag.includes("="),
      true,
      `OSM tag ${categoryObj.osmTag} should contain '='`,
    );
    assertEquals(
      categoryObj.osmTag.split("=").length,
      2,
      `OSM tag ${categoryObj.osmTag} should have exactly one '='`,
    );

    // ID should match OSM tag structure (first part before underscore = tag, rest = value)
    const underscoreIndex = categoryObj.id.indexOf("_");
    const idTag = categoryObj.id.substring(0, underscoreIndex);
    const idValue = categoryObj.id.substring(underscoreIndex + 1);
    const [osmTag, osmValue] = categoryObj.osmTag.split("=");
    assertEquals(
      idTag,
      osmTag,
      `ID tag ${idTag} should match OSM tag ${osmTag}`,
    );
    assertEquals(
      idValue,
      osmValue,
      `ID value ${idValue} should match OSM value ${osmValue}`,
    );

    // Group should be valid enum value
    assertEquals(
      Object.values(PlaceCategoryGroup).includes(categoryObj.group),
      true,
      `Invalid category group: ${categoryObj.group}`,
    );

    // Name should be properly formatted (Title Case)
    assertEquals(
      categoryObj.name.length > 0,
      true,
      `Category name should not be empty for ${categoryObj.id}`,
    );
    assertEquals(
      categoryObj.name[0].toUpperCase(),
      categoryObj.name[0],
      `Category name should start with capital letter: ${categoryObj.name}`,
    );
  }
});

Deno.test("PlaceCategorization - Category group mapping validation", () => {
  const allObjects = PlaceCategorization.getAllCategoryObjects();

  // Group all categories by their tag type
  const categoriesByTag: Record<string, any[]> = {};
  for (const obj of allObjects) {
    const [tag] = obj.osmTag.split("=");
    if (!categoriesByTag[tag]) categoriesByTag[tag] = [];
    categoriesByTag[tag].push(obj);
  }

  // Validate each major tag type has proper group coverage
  const expectedTags = ["amenity", "leisure", "shop", "tourism"];
  for (const tag of expectedTags) {
    assertEquals(
      categoriesByTag[tag]?.length > 0,
      true,
      `Should have categories for ${tag} tag`,
    );

    // Each tag type should map to multiple different groups (not all the same)
    const groups = new Set(categoriesByTag[tag].map((c) => c.group));
    assertEquals(
      groups.size > 1,
      true,
      `Tag ${tag} should map to multiple category groups, found: ${
        Array.from(groups)
      }`,
    );
  }

  // Food & Drink should be well represented
  const foodAndDrinkCategories = allObjects.filter((obj) =>
    obj.group === PlaceCategoryGroup.FOOD_AND_DRINK
  );
  assertEquals(
    foodAndDrinkCategories.length > 10,
    true,
    "Should have substantial Food & Drink category coverage",
  );

  // Shopping should be well represented
  const shoppingCategories = allObjects.filter((obj) =>
    obj.group === PlaceCategoryGroup.SHOPPING
  );
  assertEquals(
    shoppingCategories.length > 10,
    true,
    "Should have substantial Shopping category coverage",
  );
});

Deno.test("PlaceCategorization - Icon mapping validation", () => {
  const allObjects = PlaceCategorization.getAllCategoryObjects();

  let specificIconCount = 0;
  let defaultIconCount = 0;

  for (const obj of allObjects) {
    // Icon should be valid emoji or default
    assertEquals(
      obj.icon.length > 0,
      true,
      `Icon should not be empty for ${obj.id}`,
    );

    if (obj.icon === "📍") {
      defaultIconCount++;
    } else {
      specificIconCount++;
      // Specific icons should be actual emoji characters (may be multi-codepoint)
      assertEquals(
        obj.icon.length <= 10,
        true,
        `Icon should be reasonable emoji length, got: ${obj.icon} (${obj.icon.length} chars) for ${obj.id}`,
      );
    }
  }

  // At least some categories should have specific icons (not all defaults)
  assertEquals(
    specificIconCount > 20,
    true,
    `Should have substantial number of specific icons, found ${specificIconCount}`,
  );

  console.log(
    `Icon coverage: ${specificIconCount} specific, ${defaultIconCount} default (${
      Math.round(specificIconCount / allObjects.length * 100)
    }% specific)`,
  );
});

Deno.test("PlaceCategorization - getCategoryGroup method validation", () => {
  // Test a representative sample of each tag type
  const testCases = [
    {
      tag: "amenity",
      value: "restaurant",
      expectedGroup: PlaceCategoryGroup.FOOD_AND_DRINK,
    },
    {
      tag: "amenity",
      value: "hospital",
      expectedGroup: PlaceCategoryGroup.HEALTH,
    },
    {
      tag: "amenity",
      value: "bank",
      expectedGroup: PlaceCategoryGroup.SERVICES,
    },
    {
      tag: "leisure",
      value: "fitness_centre",
      expectedGroup: PlaceCategoryGroup.SPORTS,
    },
    { tag: "leisure", value: "park", expectedGroup: PlaceCategoryGroup.NATURE },
    {
      tag: "shop",
      value: "supermarket",
      expectedGroup: PlaceCategoryGroup.FOOD_AND_DRINK,
    },
    {
      tag: "shop",
      value: "clothes",
      expectedGroup: PlaceCategoryGroup.SHOPPING,
    },
    {
      tag: "tourism",
      value: "hotel",
      expectedGroup: PlaceCategoryGroup.ACCOMMODATION,
    },
    {
      tag: "tourism",
      value: "museum",
      expectedGroup: PlaceCategoryGroup.CULTURE,
    },
  ];

  for (const { tag, value, expectedGroup } of testCases) {
    const result = PlaceCategorization.getCategoryGroup(tag, value);
    assertEquals(
      result,
      expectedGroup,
      `getCategoryGroup(${tag}, ${value}) should return ${expectedGroup}`,
    );
  }

  // Test unknown tag/value combinations
  assertEquals(PlaceCategorization.getCategoryGroup("unknown", "value"), null);
  assertEquals(
    PlaceCategorization.getCategoryGroup("amenity", "unknown_value"),
    PlaceCategoryGroup.SERVICES,
  ); // fallback
});

Deno.test("PlaceCategorization - getCategoryById validation", () => {
  // Test valid IDs
  const cafeCategory = PlaceCategorization.getCategoryById("amenity_cafe");
  assertExists(cafeCategory);
  assertEquals(cafeCategory.id, "amenity_cafe");
  assertEquals(cafeCategory.osmTag, "amenity=cafe");
  assertEquals(cafeCategory.group, PlaceCategoryGroup.FOOD_AND_DRINK);

  // Test invalid IDs
  assertEquals(PlaceCategorization.getCategoryById("invalid"), null);
  assertEquals(
    PlaceCategorization.getCategoryById("invalid_format_too_many_parts"),
    null,
  );
  assertEquals(PlaceCategorization.getCategoryById(""), null);
});

Deno.test("PlaceCategorization - Social check-in focus validation", () => {
  const prioritized = PlaceCategorization.getPrioritizedCategories();

  // Prioritized should focus on social/experience categories
  const socialCategories = [
    "amenity=restaurant",
    "amenity=cafe",
    "amenity=bar",
    "amenity=cinema",
    "tourism=attraction",
    "tourism=museum",
    "leisure=fitness_centre",
  ];

  for (const category of socialCategories) {
    assertEquals(
      prioritized.includes(category),
      true,
      `Prioritized should include social category: ${category}`,
    );
  }

  // Should NOT prioritize utility categories (unless essential)
  const utilityCategories = [
    "amenity=toilets",
    "amenity=waste_disposal",
    "amenity=recycling",
  ];

  for (const category of utilityCategories) {
    assertEquals(
      prioritized.includes(category),
      false,
      `Prioritized should NOT include utility category: ${category}`,
    );
  }
});
