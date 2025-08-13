// Place categorization system ported from Swift PlaceCategorization.swift
// Provides OSM tag categorization, icons, and grouping for UI display

import {
  PlaceCategory,
  PlaceCategoryGroup,
  PlaceCategoryGroupInfo,
} from "../models/place-models.ts";

export class PlaceCategorization {
  // MARK: - OpenStreetMap Category Definitions (from Swift)

  static readonly AMENITY_CATEGORIES = [
    // Food & Drink
    "restaurant",
    "cafe",
    "bar",
    "pub",
    "fast_food",
    "food_court",
    "ice_cream",
    "biergarten",

    // Education
    "school",
    "university",
    "college",
    "library",
    "driving_school",
    "language_school",
    "music_school",

    // Healthcare
    "hospital",
    "clinic",
    "pharmacy",
    "dentist",
    "veterinary",
    "nursing_home",

    // Entertainment & Culture
    "cinema",
    "theatre",
    "nightclub",
    "casino",
    "arts_centre",
    "community_centre",
    "exhibition_centre",
    "music_venue",

    // Transportation
    "bus_station",
    "taxi",
    "ferry_terminal",
    "fuel",
    "charging_station",
    "car_wash",
    "parking",
    "bicycle_parking",

    // Public Services
    "townhall",
    "courthouse",
    "police",
    "fire_station",
    "post_office",
    "bank",
    "bureau_de_change",
    "atm",

    // Facilities
    "toilets",
    "drinking_water",
    "shower",
    "bench",
    "shelter",
    "waste_disposal",
    "recycling",
  ];

  static readonly LEISURE_CATEGORIES = [
    // Sports & Fitness
    "fitness_centre",
    "sports_centre",
    "sports_hall",
    "swimming_pool",
    "pitch",
    "track",
    "golf_course",
    "climbing",
    "horse_riding",
    "bowling_alley",
    "ice_rink",
    "stadium",

    // Entertainment & Gaming
    "amusement_arcade",
    "escape_game",
    "trampoline_park",
    "water_park",
    "dance",
    "adult_gaming_centre",
    "miniature_golf",

    // Relaxation & Nature
    "park",
    "beach_resort",
    "nature_reserve",
    "garden",
    "bird_hide",
    "wildlife_hide",
    "sauna",
    "picnic_site",
    "playground",

    // Marine & Adventure
    "marina",
    "slipway",
    "summer_camp",
    "high_ropes",
  ];

  static readonly SHOP_CATEGORIES = [
    // Food & Beverage
    "supermarket",
    "convenience",
    "bakery",
    "butcher",
    "greengrocer",
    "wine",
    "coffee",
    "deli",
    "confectionery",
    "cheese",
    "seafood",
    "spices",
    "tea",

    // Clothing & Fashion
    "clothes",
    "shoes",
    "jewelry",
    "tailor",
    "fabric",
    "fashion_accessories",
    "bag",
    "watches",

    // Electronics & Technology
    "electronics",
    "computer",
    "mobile_phone",
    "camera",
    "hifi",
    "video_games",

    // Home & Lifestyle
    "furniture",
    "appliance",
    "doityourself",
    "hardware",
    "paint",
    "lighting",
    "kitchen",
    "interior_decoration",
    "curtain",
    "florist",
    "garden_centre",

    // Books & Media
    "books",
    "stationery",
    "newsagent",
    "art",
    "music",
    "video",

    // Health & Beauty
    "cosmetics",
    "hairdresser",
    "beauty",
    "massage",
    "optician",
    "medical_supply",

    // Sports & Outdoor
    "sports",
    "outdoor",
    "bicycle",
    "fishing",
    "hunting",
    "ski",

    // Vehicles
    "car",
    "car_parts",
    "motorcycle",
    "tyres",

    // Specialty & Services
    "gift",
    "lottery",
    "pet",
    "tobacco",
    "trade",
    "travel_agency",
    "copyshop",
    "laundry",
    "dry_cleaning",
    "funeral_directors",
  ];

  static readonly TOURISM_CATEGORIES = [
    // Accommodations
    "hotel",
    "motel",
    "guest_house",
    "hostel",
    "chalet",
    "apartment",
    "camp_site",
    "caravan_site",
    "alpine_hut",
    "wilderness_hut",

    // Attractions
    "attraction",
    "museum",
    "gallery",
    "aquarium",
    "zoo",
    "theme_park",
    "viewpoint",
    "artwork",

    // Services
    "information",
    "picnic_site",
    "trail_riding_station",
  ];

  // MARK: - Category Groups

  static readonly CATEGORY_GROUPS: Record<
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

  // MARK: - Category Mapping Methods

  /**
   * Get category group for an OSM tag/value pair
   */
  static getCategoryGroup(
    tag: string,
    value: string,
  ): PlaceCategoryGroup | null {
    switch (tag) {
      case "amenity":
        switch (value) {
          case "restaurant":
          case "cafe":
          case "bar":
          case "pub":
          case "fast_food":
          case "food_court":
          case "ice_cream":
          case "biergarten":
            return PlaceCategoryGroup.FOOD_AND_DRINK;

          case "cinema":
          case "theatre":
          case "nightclub":
          case "casino":
          case "arts_centre":
          case "community_centre":
          case "exhibition_centre":
          case "music_venue":
            return PlaceCategoryGroup.ENTERTAINMENT;

          case "hospital":
          case "clinic":
          case "pharmacy":
          case "dentist":
          case "veterinary":
          case "nursing_home":
            return PlaceCategoryGroup.HEALTH;

          case "school":
          case "university":
          case "college":
          case "library":
          case "driving_school":
          case "language_school":
          case "music_school":
            return PlaceCategoryGroup.EDUCATION;

          case "bus_station":
          case "taxi":
          case "ferry_terminal":
          case "fuel":
          case "charging_station":
          case "car_wash":
          case "parking":
          case "bicycle_parking":
            return PlaceCategoryGroup.TRANSPORTATION;

          case "townhall":
          case "courthouse":
          case "police":
          case "fire_station":
          case "post_office":
          case "bank":
          case "bureau_de_change":
          case "atm":
            return PlaceCategoryGroup.SERVICES;

          default:
            return PlaceCategoryGroup.SERVICES;
        }
        break;

      case "leisure":
        switch (value) {
          case "fitness_centre":
          case "sports_centre":
          case "sports_hall":
          case "swimming_pool":
          case "pitch":
          case "track":
          case "golf_course":
          case "climbing":
          case "horse_riding":
          case "bowling_alley":
          case "ice_rink":
          case "stadium":
            return PlaceCategoryGroup.SPORTS;

          case "amusement_arcade":
          case "escape_game":
          case "trampoline_park":
          case "water_park":
          case "dance":
          case "adult_gaming_centre":
          case "miniature_golf":
            return PlaceCategoryGroup.ENTERTAINMENT;

          case "park":
          case "beach_resort":
          case "nature_reserve":
          case "garden":
          case "bird_hide":
          case "wildlife_hide":
          case "picnic_site":
          case "playground":
            return PlaceCategoryGroup.NATURE;

          default:
            return PlaceCategoryGroup.ENTERTAINMENT;
        }
        break;

      case "shop":
        switch (value) {
          case "supermarket":
          case "convenience":
          case "bakery":
          case "butcher":
          case "greengrocer":
          case "wine":
          case "coffee":
          case "deli":
          case "confectionery":
          case "cheese":
          case "seafood":
          case "spices":
          case "tea":
            return PlaceCategoryGroup.FOOD_AND_DRINK;

          case "cosmetics":
          case "hairdresser":
          case "beauty":
          case "massage":
          case "optician":
          case "medical_supply":
            return PlaceCategoryGroup.HEALTH;

          case "books":
          case "stationery":
          case "newsagent":
          case "art":
          case "music":
          case "video":
            return PlaceCategoryGroup.CULTURE;

          default:
            return PlaceCategoryGroup.SHOPPING;
        }
        break;

      case "tourism":
        switch (value) {
          case "hotel":
          case "motel":
          case "guest_house":
          case "hostel":
          case "chalet":
          case "apartment":
          case "camp_site":
          case "caravan_site":
          case "alpine_hut":
          case "wilderness_hut":
            return PlaceCategoryGroup.ACCOMMODATION;

          case "museum":
          case "gallery":
          case "artwork":
            return PlaceCategoryGroup.CULTURE;

          case "attraction":
          case "aquarium":
          case "zoo":
          case "theme_park":
          case "viewpoint":
            return PlaceCategoryGroup.ENTERTAINMENT;

          default:
            return PlaceCategoryGroup.SERVICES;
        }
        break;

      default:
        return null;
    }
  }

  /**
   * Get icon for an OSM tag/value pair
   */
  static getIcon(tag: string, value: string): string {
    const fullTag = `${tag}=${value}`;

    // Icon mapping (from Swift implementation)
    const iconMap: Record<string, string> = {
      // Food & Drink
      "amenity=restaurant": "🍽️",
      "amenity=fast_food": "🍽️",
      "amenity=cafe": "☕",
      "shop=coffee": "☕",
      "amenity=bar": "🍺",
      "amenity=pub": "🍺",
      "amenity=ice_cream": "🍦",
      "amenity=biergarten": "🍻",
      "shop=bakery": "🥖",
      "shop=wine": "🍷",

      // Entertainment
      "amenity=cinema": "🎬",
      "amenity=theatre": "🎭",
      "amenity=nightclub": "💃",
      "amenity=casino": "🎰",
      "leisure=bowling_alley": "🎳",
      "leisure=amusement_arcade": "🕹️",
      "tourism=theme_park": "🎢",

      // Sports & Fitness
      "leisure=fitness_centre": "🏋️‍♂️",
      "leisure=sports_centre": "🏋️‍♂️",
      "leisure=swimming_pool": "🏊‍♂️",
      "leisure=climbing": "🧗‍♂️",
      "leisure=golf_course": "⛳",
      "leisure=stadium": "🏟️",
      "leisure=ice_rink": "⛸️",

      // Shopping
      "shop=supermarket": "🛒",
      "shop=clothes": "👕",
      "shop=shoes": "👟",
      "shop=books": "📚",
      "shop=electronics": "📱",
      "shop=jewelry": "💍",
      "shop=florist": "💐",

      // Accommodation
      "tourism=hotel": "🏨",
      "tourism=hostel": "🏠",
      "tourism=camp_site": "🏕️",

      // Transportation
      "amenity=bus_station": "🚌",
      "amenity=fuel": "⛽",
      "amenity=parking": "🅿️",
      "amenity=bicycle_parking": "🚲",

      // Culture & Education
      "tourism=museum": "🏛️",
      "amenity=library": "🏛️",
      "tourism=gallery": "🎨",
      "amenity=school": "🎓",
      "amenity=university": "🎓",

      // Health
      "amenity=hospital": "🏥",
      "amenity=pharmacy": "💊",
      "amenity=dentist": "🦷",

      // Nature
      "leisure=park": "🌳",
      "leisure=beach_resort": "🏖️",
      "tourism=viewpoint": "🔭",
      "leisure=playground": "🛝",

      // Services
      "amenity=bank": "🏦",
      "amenity=post_office": "📮",
      "amenity=police": "👮‍♂️",
      "amenity=fire_station": "🚒",
    };

    return iconMap[fullTag] || "📍";
  }

  /**
   * Get all available categories as OSM tag strings
   */
  static getAllCategories(): string[] {
    const categories: string[] = [];

    // Add all amenity categories
    categories.push(...this.AMENITY_CATEGORIES.map((cat) => `amenity=${cat}`));

    // Add all leisure categories
    categories.push(...this.LEISURE_CATEGORIES.map((cat) => `leisure=${cat}`));

    // Add all shop categories
    categories.push(...this.SHOP_CATEGORIES.map((cat) => `shop=${cat}`));

    // Add all tourism categories
    categories.push(...this.TOURISM_CATEGORIES.map((cat) => `tourism=${cat}`));

    return categories.sort();
  }

  /**
   * Get prioritized categories optimized for social check-ins
   * Focuses on places people want to share and experience (like Foursquare/Swarm)
   */
  static getPrioritizedCategories(): string[] {
    return [
      // Food & Drink (most popular check-ins)
      "amenity=restaurant",
      "amenity=cafe",
      "amenity=bar",
      "amenity=pub",
      "amenity=fast_food",
      "amenity=ice_cream",
      "amenity=biergarten",

      // Entertainment & Nightlife (social experiences)
      "amenity=cinema",
      "amenity=theatre",
      "amenity=nightclub",
      "leisure=bowling_alley",
      "leisure=amusement_arcade",

      // Attractions & Culture (destination spots)
      "tourism=attraction",
      "tourism=museum",
      "tourism=gallery",
      "tourism=zoo",
      "tourism=theme_park",
      "tourism=viewpoint",

      // Shopping (experience-worthy)
      "shop=supermarket",
      "shop=convenience",
      "shop=clothes",
      "shop=electronics",
      "shop=books",

      // Sports & Fitness (social activities)
      "leisure=fitness_centre",
      "leisure=sports_centre",
      "leisure=climbing",
      "leisure=swimming_pool",
      "leisure=golf_course",
      "leisure=stadium",

      // Recreation & Outdoors
      "leisure=park",
      "leisure=playground",
      "leisure=beach_resort",

      // Travel & Accommodation
      "tourism=hotel",
      "tourism=hostel",
      "amenity=fuel",

      // Essential Services (sometimes shared)
      "amenity=bank",
      "amenity=library",

      // Education (milestone check-ins)
      "amenity=school",
      "amenity=university",
    ];
  }

  /**
   * Create PlaceCategory object with unique ID
   */
  static createCategory(tag: string, value: string): PlaceCategory {
    const osmTag = `${tag}=${value}`;
    const id = `${tag}_${value}`;
    const group = this.getCategoryGroup(tag, value) ||
      PlaceCategoryGroup.SERVICES;
    const icon = this.getIcon(tag, value);

    // Capitalize value for display name
    const name = value.split("_").map((word) =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");

    return {
      id,
      name,
      icon,
      group,
      osmTag,
    };
  }

  /**
   * Get all category objects with IDs
   */
  static getAllCategoryObjects(): PlaceCategory[] {
    const categories: PlaceCategory[] = [];

    // Process all tag types
    const tagTypes = [
      { tag: "amenity", values: this.AMENITY_CATEGORIES },
      { tag: "leisure", values: this.LEISURE_CATEGORIES },
      { tag: "shop", values: this.SHOP_CATEGORIES },
      { tag: "tourism", values: this.TOURISM_CATEGORIES },
    ];

    for (const { tag, values } of tagTypes) {
      for (const value of values) {
        categories.push(this.createCategory(tag, value));
      }
    }

    return categories.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get category by ID
   */
  static getCategoryById(id: string): PlaceCategory | null {
    const [tag, value] = id.split("_", 2);
    if (!tag || !value) return null;

    return this.createCategory(tag, value);
  }
}
