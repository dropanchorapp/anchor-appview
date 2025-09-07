// Centralized category service with efficient metadata for different use cases
// Consolidates PlaceCategorization logic with address resolution and search strategies

import {
  PlaceCategory,
  PlaceCategoryGroup,
  PlaceCategoryGroupInfo,
} from "../models/place-models.ts";

// Category metadata for efficient use case filtering
export interface CategoryMetadata {
  includeInDefaultSearch: boolean; // Include in default search queries (vs on-demand when user specifies)
  addressStrategy: "venue" | "geographic" | "standard"; // Address resolution: venue=skip geocoding, geographic=use Nominatim
  socialRelevance: boolean; // Check-in worthy places for social feeds
}

// Extended category definition with metadata
export interface CategoryDefinition {
  tag: string; // "amenity", "leisure", etc.
  value: string; // "cafe", "restaurant", etc.
  group: PlaceCategoryGroup;
  icon: string;
  metadata: CategoryMetadata;
}

export class CategoryService {
  // Centralized category definitions with metadata
  private static readonly CATEGORY_DEFINITIONS: CategoryDefinition[] = [
    // === FOOD & DRINK ===
    {
      tag: "amenity",
      value: "restaurant",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍽️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "cafe",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "☕",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "bar",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍺",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "pub",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍺",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "fast_food",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍽️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "ice_cream",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍦",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "biergarten",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍻",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "food_court",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍽️",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "shop",
      value: "bakery",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🥖",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "shop",
      value: "wine",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🍷",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "shop",
      value: "coffee",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "☕",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "shop",
      value: "supermarket",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🛒",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "shop",
      value: "convenience",
      group: PlaceCategoryGroup.FOOD_AND_DRINK,
      icon: "🛒",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },

    // === ENTERTAINMENT ===
    {
      tag: "amenity",
      value: "cinema",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🎬",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "theatre",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🎭",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "nightclub",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "💃",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "casino",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🎰",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "leisure",
      value: "bowling_alley",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🎳",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "amusement_arcade",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🕹️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "tourism",
      value: "theme_park",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🎢",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },

    // === SPORTS & FITNESS ===
    {
      tag: "leisure",
      value: "fitness_centre",
      group: PlaceCategoryGroup.SPORTS,
      icon: "🏋️‍♂️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "sports_centre",
      group: PlaceCategoryGroup.SPORTS,
      icon: "🏋️‍♂️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "climbing",
      group: PlaceCategoryGroup.SPORTS,
      icon: "🧗‍♂️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "swimming_pool",
      group: PlaceCategoryGroup.SPORTS,
      icon: "🏊‍♂️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "golf_course",
      group: PlaceCategoryGroup.SPORTS,
      icon: "⛳",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "stadium",
      group: PlaceCategoryGroup.SPORTS,
      icon: "🏟️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },

    // === CULTURE & ATTRACTIONS ===
    {
      tag: "tourism",
      value: "attraction",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
    {
      tag: "tourism",
      value: "museum",
      group: PlaceCategoryGroup.CULTURE,
      icon: "🏛️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "tourism",
      value: "gallery",
      group: PlaceCategoryGroup.CULTURE,
      icon: "🎨",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "tourism",
      value: "zoo",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
    {
      tag: "tourism",
      value: "viewpoint",
      group: PlaceCategoryGroup.ENTERTAINMENT,
      icon: "🔭",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },

    // === NATURE & PARKS ===
    {
      tag: "leisure",
      value: "park",
      group: PlaceCategoryGroup.NATURE,
      icon: "🌳",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "playground",
      group: PlaceCategoryGroup.NATURE,
      icon: "🛝",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
    {
      tag: "leisure",
      value: "beach_resort",
      group: PlaceCategoryGroup.NATURE,
      icon: "🏖️",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "geographic",
        socialRelevance: false,
      },
    },

    // === ACCOMMODATION ===
    {
      tag: "tourism",
      value: "hotel",
      group: PlaceCategoryGroup.ACCOMMODATION,
      icon: "🏨",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "tourism",
      value: "hostel",
      group: PlaceCategoryGroup.ACCOMMODATION,
      icon: "🏠",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },

    // === TRANSPORTATION ===
    {
      tag: "amenity",
      value: "fuel",
      group: PlaceCategoryGroup.TRANSPORTATION,
      icon: "⛽",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },

    // === SHOPPING ===
    {
      tag: "shop",
      value: "clothes",
      group: PlaceCategoryGroup.SHOPPING,
      icon: "👕",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "shop",
      value: "electronics",
      group: PlaceCategoryGroup.SHOPPING,
      icon: "📱",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "shop",
      value: "books",
      group: PlaceCategoryGroup.CULTURE,
      icon: "📚",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },

    // === SERVICES ===
    {
      tag: "amenity",
      value: "bank",
      group: PlaceCategoryGroup.SERVICES,
      icon: "🏦",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "library",
      group: PlaceCategoryGroup.EDUCATION,
      icon: "🏛️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },

    // === EDUCATION ===
    {
      tag: "amenity",
      value: "school",
      group: PlaceCategoryGroup.EDUCATION,
      icon: "🎓",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "university",
      group: PlaceCategoryGroup.EDUCATION,
      icon: "🎓",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },

    // === HEALTH ===
    {
      tag: "amenity",
      value: "hospital",
      group: PlaceCategoryGroup.HEALTH,
      icon: "🏥",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "amenity",
      value: "pharmacy",
      group: PlaceCategoryGroup.HEALTH,
      icon: "💊",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },

    // === ON-DEMAND CATEGORIES (not included in default search) ===
    // These provide proper categorization when places are found via user-specified searches,
    // but aren't included in default discovery queries (utility services, overly specific shops, etc.)

    // Additional amenities
    {
      tag: "amenity",
      value: "atm",
      group: PlaceCategoryGroup.SERVICES,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "standard",
        socialRelevance: false,
      },
    },
    {
      tag: "amenity",
      value: "toilets",
      group: PlaceCategoryGroup.SERVICES,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "standard",
        socialRelevance: false,
      },
    },
    {
      tag: "amenity",
      value: "bench",
      group: PlaceCategoryGroup.SERVICES,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "standard",
        socialRelevance: false,
      },
    },

    // Additional shops
    {
      tag: "shop",
      value: "shoes",
      group: PlaceCategoryGroup.SHOPPING,
      icon: "👟",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "shop",
      value: "jewelry",
      group: PlaceCategoryGroup.SHOPPING,
      icon: "💍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },
    {
      tag: "shop",
      value: "florist",
      group: PlaceCategoryGroup.SHOPPING,
      icon: "💐",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "venue",
        socialRelevance: false,
      },
    },

    // Additional leisure
    {
      tag: "leisure",
      value: "garden",
      group: PlaceCategoryGroup.NATURE,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "geographic",
        socialRelevance: false,
      },
    },
    {
      tag: "leisure",
      value: "marina",
      group: PlaceCategoryGroup.TRANSPORTATION,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "geographic",
        socialRelevance: false,
      },
    },

    // Additional tourism
    {
      tag: "tourism",
      value: "monument",
      group: PlaceCategoryGroup.CULTURE,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "geographic",
        socialRelevance: false,
      },
    },
    {
      tag: "tourism",
      value: "memorial",
      group: PlaceCategoryGroup.CULTURE,
      icon: "📍",
      metadata: {
        includeInDefaultSearch: false,
        addressStrategy: "geographic",
        socialRelevance: false,
      },
    },

    // === HEALTH ===
    {
      tag: "amenity",
      value: "healthcare",
      group: PlaceCategoryGroup.HEALTH,
      icon: "🏥",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "healthcare",
      value: "physiotherapist",
      group: PlaceCategoryGroup.HEALTH,
      icon: "🏥",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "doctors",
      group: PlaceCategoryGroup.HEALTH,
      icon: "👩‍⚕️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },
    {
      tag: "amenity",
      value: "dentist",
      group: PlaceCategoryGroup.HEALTH,
      icon: "🦷",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "venue",
        socialRelevance: true,
      },
    },

    // === NATURE ===
    {
      tag: "natural",
      value: "peak",
      group: PlaceCategoryGroup.NATURE,
      icon: "⛰️",
      metadata: {
        includeInDefaultSearch: true,
        addressStrategy: "geographic",
        socialRelevance: true,
      },
    },
  ];

  // Category group definitions
  private static readonly CATEGORY_GROUPS: Record<
    PlaceCategoryGroup,
    PlaceCategoryGroupInfo
  > = {
    [PlaceCategoryGroup.FOOD_AND_DRINK]: {
      id: PlaceCategoryGroup.FOOD_AND_DRINK,
      name: "Food & Drink",
      icon: "🍽️",
    },
    [PlaceCategoryGroup.ENTERTAINMENT]: {
      id: PlaceCategoryGroup.ENTERTAINMENT,
      name: "Entertainment",
      icon: "🎭",
    },
    [PlaceCategoryGroup.SPORTS]: {
      id: PlaceCategoryGroup.SPORTS,
      name: "Sports & Fitness",
      icon: "🏃‍♂️",
    },
    [PlaceCategoryGroup.SHOPPING]: {
      id: PlaceCategoryGroup.SHOPPING,
      name: "Shopping",
      icon: "🛍️",
    },
    [PlaceCategoryGroup.ACCOMMODATION]: {
      id: PlaceCategoryGroup.ACCOMMODATION,
      name: "Accommodation",
      icon: "🏨",
    },
    [PlaceCategoryGroup.TRANSPORTATION]: {
      id: PlaceCategoryGroup.TRANSPORTATION,
      name: "Transportation",
      icon: "🚌",
    },
    [PlaceCategoryGroup.SERVICES]: {
      id: PlaceCategoryGroup.SERVICES,
      name: "Services",
      icon: "🏛️",
    },
    [PlaceCategoryGroup.NATURE]: {
      id: PlaceCategoryGroup.NATURE,
      name: "Nature & Parks",
      icon: "🌳",
    },
    [PlaceCategoryGroup.CULTURE]: {
      id: PlaceCategoryGroup.CULTURE,
      name: "Culture",
      icon: "🎨",
    },
    [PlaceCategoryGroup.HEALTH]: {
      id: PlaceCategoryGroup.HEALTH,
      name: "Health",
      icon: "🏥",
    },
    [PlaceCategoryGroup.EDUCATION]: {
      id: PlaceCategoryGroup.EDUCATION,
      name: "Education",
      icon: "📚",
    },
  };

  // === USE CASE SPECIFIC METHODS ===

  /**
   * Get categories for default Overpass API queries (when user doesn't specify categories)
   * Returns OSM tag format: ["amenity=restaurant", "amenity=cafe", ...]
   */
  static getDefaultSearchCategories(): string[] {
    return this.CATEGORY_DEFINITIONS
      .filter((def) => def.metadata.includeInDefaultSearch)
      .map((def) => `${def.tag}=${def.value}`)
      .sort();
  }

  /**
   * Check if a category value should use venue address strategy (skip expensive geocoding)
   * Used by OverpassService.isVenueWithGoodAddress()
   */
  static shouldUseVenueAddressStrategy(categoryValue: string): boolean {
    const definition = this.CATEGORY_DEFINITIONS.find((def) =>
      def.value === categoryValue
    );
    return definition?.metadata.addressStrategy === "venue" || false;
  }

  /**
   * Check if a category value should use geographic address strategy (use Nominatim)
   * Used by OverpassService.isGeographicArea()
   */
  static shouldUseGeographicAddressStrategy(categoryValue: string): boolean {
    const definition = this.CATEGORY_DEFINITIONS.find((def) =>
      def.value === categoryValue
    );
    return definition?.metadata.addressStrategy === "geographic" || false;
  }

  /**
   * Get socially relevant categories (check-in worthy places)
   * Returns OSM tag format for social feed prioritization
   */
  static getSociallyRelevantCategories(): string[] {
    return this.CATEGORY_DEFINITIONS
      .filter((def) => def.metadata.socialRelevance)
      .map((def) => `${def.tag}=${def.value}`)
      .sort();
  }

  // === BACKWARD COMPATIBILITY METHODS ===

  /**
   * Get all categories as OSM tag strings (backward compatibility)
   */
  static getAllCategories(): string[] {
    return this.CATEGORY_DEFINITIONS
      .map((def) => `${def.tag}=${def.value}`)
      .sort();
  }

  /**
   * Get prioritized categories (backward compatibility)
   * Maps to default search categories
   */
  static getPrioritizedCategories(): string[] {
    return this.getDefaultSearchCategories();
  }

  /**
   * Get category group for tag/value pair (backward compatibility)
   */
  static getCategoryGroup(
    tag: string,
    value: string,
  ): PlaceCategoryGroup | null {
    const definition = this.CATEGORY_DEFINITIONS.find((def) =>
      def.tag === tag && def.value === value
    );
    return definition?.group ?? null;
  }

  /**
   * Get icon for tag/value pair (backward compatibility)
   */
  static getIcon(tag: string, value: string): string {
    const definition = this.CATEGORY_DEFINITIONS.find((def) =>
      def.tag === tag && def.value === value
    );
    return definition?.icon ?? "📍";
  }

  /**
   * Get all category objects with IDs (backward compatibility)
   */
  static getAllCategoryObjects(): PlaceCategory[] {
    return this.CATEGORY_DEFINITIONS.map((def) => ({
      id: `${def.tag}_${def.value}`,
      name: this.formatCategoryName(def.value),
      icon: def.icon,
      group: def.group,
      osmTag: `${def.tag}=${def.value}`,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get category by ID (backward compatibility)
   */
  static getCategoryById(id: string): PlaceCategory | null {
    const underscoreIndex = id.indexOf("_");
    if (underscoreIndex === -1) return null;

    const tag = id.substring(0, underscoreIndex);
    const value = id.substring(underscoreIndex + 1);
    if (!tag || !value) return null;

    // Validate that this is a real category
    const definition = this.CATEGORY_DEFINITIONS.find((def) =>
      def.tag === tag && def.value === value
    );
    if (!definition) return null;

    return {
      id,
      name: this.formatCategoryName(value),
      icon: definition.icon,
      group: definition.group,
      osmTag: `${tag}=${value}`,
    };
  }

  /**
   * Get category group info (backward compatibility)
   */
  static getCategoryGroupInfo(
    group: PlaceCategoryGroup,
  ): PlaceCategoryGroupInfo {
    return this.CATEGORY_GROUPS[group];
  }

  // === UTILITY METHODS ===

  /**
   * Format category value to display name
   */
  private static formatCategoryName(value: string): string {
    return value.split("_").map((word) =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  }

  /**
   * Get detailed category information including metadata
   */
  static getCategoryDetails(
    tag: string,
    value: string,
  ): CategoryDefinition | null {
    return this.CATEGORY_DEFINITIONS.find((def) =>
      def.tag === tag && def.value === value
    ) ?? null;
  }

  /**
   * Get all category definitions (for admin/debugging)
   */
  static getAllCategoryDefinitions(): CategoryDefinition[] {
    return [...this.CATEGORY_DEFINITIONS];
  }
}
