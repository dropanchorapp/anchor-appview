// Place discovery models for OSM/Overpass API integration

export interface Place {
  // OSM identification
  id: string; // "node:123456789" or "way:123456789"
  elementType: "node" | "way" | "relation";
  elementId: number;

  // Basic place info
  name: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>; // All OSM tags

  // Address components (extracted from OSM tags)
  address: CommunityAddressRecord;

  // UI helpers
  category?: string; // "cafe", "restaurant"
  categoryGroup?: PlaceCategoryGroup;
  icon: string; // "☕", "🍽️"
}

export interface PlaceWithDistance extends Place {
  distanceMeters: number;
  formattedDistance: string; // "45m", "1.2km"
}

// AT Protocol community lexicon address format
export interface CommunityAddressRecord {
  $type: "community.lexicon.location.address";
  name?: string; // "Blue Bottle Coffee"
  street?: string; // "315 Linden St"
  locality?: string; // "San Francisco"
  region?: string; // "CA"
  country?: string; // "US"
  postalCode?: string; // "94102"
}

// Category system with unique IDs
export interface PlaceCategory {
  id: string; // "amenity_cafe", "leisure_climbing"
  name: string; // "Cafe", "Climbing Gym"
  icon: string; // "☕", "🧗‍♂️"
  group: PlaceCategoryGroup;
  osmTag: string; // "amenity=cafe"
}

export enum PlaceCategoryGroup {
  FOOD_AND_DRINK = "food_and_drink",
  ENTERTAINMENT = "entertainment",
  SPORTS = "sports",
  SHOPPING = "shopping",
  ACCOMMODATION = "accommodation",
  TRANSPORTATION = "transportation",
  SERVICES = "services",
  NATURE = "nature",
  CULTURE = "culture",
  HEALTH = "health",
  EDUCATION = "education",
}

export interface PlaceCategoryGroupInfo {
  id: PlaceCategoryGroup;
  name: string;
  icon: string;
}

// Overpass API response structures
export interface OverpassResponse {
  version?: number;
  generator?: string;
  elements: OverpassElement[];
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
}

// API response format
export interface PlacesNearbyResponse {
  places: PlaceWithDistance[];
  totalCount: number;
  searchRadius: number;
  categories?: string[];
  searchCoordinate: {
    latitude: number;
    longitude: number;
  };
}

// Error types
export class OverpassError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = "OverpassError";
  }

  static invalidURL() {
    return new OverpassError("Invalid Overpass API URL");
  }

  static httpError(statusCode: number) {
    return new OverpassError(
      `HTTP error ${statusCode} from Overpass API`,
      statusCode,
    );
  }

  static networkError(cause: Error) {
    return new OverpassError(
      `Network error: ${cause.message}`,
      undefined,
      cause,
    );
  }

  static decodingError(cause: Error) {
    return new OverpassError(
      `Failed to decode Overpass response: ${cause.message}`,
      undefined,
      cause,
    );
  }
}

export interface OverpassServiceConfig {
  baseURL: string;
  timeout: number;
  userAgent: string;
  maxResults: number;
  defaultRadius: number;
  cacheValidDuration: number; // milliseconds
  locationToleranceMeters: number;
}
