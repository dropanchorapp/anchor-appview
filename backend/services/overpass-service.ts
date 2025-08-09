// Overpass API service for querying OpenStreetMap data
// TypeScript port of Swift OverpassService with address extraction

import {
  CommunityAddressRecord,
  OverpassElement,
  OverpassError,
  OverpassResponse,
  OverpassServiceConfig,
  Place,
  PlaceCategoryGroup,
  PlaceWithDistance,
} from "../models/place-models.ts";
import { PlaceCategorization } from "../utils/place-categorization.ts";

interface CachedPlaces {
  places: Place[];
  coordinate: { latitude: number; longitude: number };
  radiusMeters: number;
  categories: string[];
  timestamp: Date;
}

export class OverpassService {
  private readonly config: OverpassServiceConfig;
  private readonly placesCache = new Map<string, CachedPlaces>();

  constructor(config?: Partial<OverpassServiceConfig>) {
    this.config = {
      baseURL: "https://overpass.private.coffee/api/interpreter",
      timeout: 10000, // 10 seconds
      userAgent:
        "Anchor-AppView/1.0 (atproto check-in app; https://dropanchor.app)",
      maxResults: 50,
      defaultRadius: 300, // meters
      cacheValidDuration: 5 * 60 * 1000, // 5 minutes
      locationToleranceMeters: 100,
      ...config,
    };
  }

  /**
   * Find nearby places within a given radius
   */
  async findNearbyPlaces(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number = this.config.defaultRadius,
    categories: string[] = [],
  ): Promise<Place[]> {
    // Cleanup expired cache entries
    this.cleanupExpiredCache();

    // Create cache key
    const cacheKey = this.createCacheKey(coordinate, radiusMeters, categories);

    // Check cache
    const cached = this.placesCache.get(cacheKey);
    if (cached && this.isCacheValid(cached, coordinate)) {
      const cacheAge = Math.floor(
        (Date.now() - cached.timestamp.getTime()) / 1000,
      );
      console.log(
        `📍 Using cached places for location (${cached.places.length} places, age: ${cacheAge}s)`,
      );
      return cached.places;
    }

    console.log(
      `📍 Cache miss - fetching fresh places from Overpass API (key: ${cacheKey})`,
    );

    // Build Overpass query
    const query = this.buildOverpassQuery(coordinate, radiusMeters, categories);

    // Make request
    const request = this.buildRequest(query);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout,
      );

      const response = await fetch(request, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw OverpassError.httpError(response.status);
      }

      const overpassResponse: OverpassResponse = await response.json();
      const places = overpassResponse.elements
        .map((element) => this.parseElement(element))
        .filter((place): place is Place => place !== null);

      // Cache the results
      const cachedPlaces: CachedPlaces = {
        places,
        coordinate,
        radiusMeters,
        categories: categories.length > 0
          ? categories
          : this.getDefaultCategories(),
        timestamp: new Date(),
      };
      this.placesCache.set(cacheKey, cachedPlaces);

      console.log(`📍 Cached ${places.length} places for location`);
      return places;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new OverpassError("Request timeout");
      }
      if (error instanceof TypeError) {
        throw OverpassError.networkError(error);
      }
      throw error;
    }
  }

  /**
   * Find nearby places with distance information, sorted by distance
   */
  async findNearbyPlacesWithDistance(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number = this.config.defaultRadius,
    categories: string[] = [],
  ): Promise<PlaceWithDistance[]> {
    const places = await this.findNearbyPlaces(
      coordinate,
      radiusMeters,
      categories,
    );

    // Calculate distances and create PlaceWithDistance objects
    const placesWithDistance = places.map((place) => {
      const distanceMeters = this.calculateDistance(
        coordinate.latitude,
        coordinate.longitude,
        place.latitude,
        place.longitude,
      );

      return {
        ...place,
        distanceMeters,
        formattedDistance: this.formatDistance(distanceMeters),
      } as PlaceWithDistance;
    });

    // Sort by distance (closest first)
    return placesWithDistance.sort((a, b) =>
      a.distanceMeters - b.distanceMeters
    );
  }

  /**
   * Clear all cached places data
   */
  clearCache(): void {
    this.placesCache.clear();
    console.log("📍 Cleared all cached places");
  }

  // MARK: - Private Methods

  private createCacheKey(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number,
    categories: string[],
  ): string {
    // Round to 3 decimal places for ~100 meter precision
    const roundedLat = Math.round(coordinate.latitude * 1000) / 1000;
    const roundedLon = Math.round(coordinate.longitude * 1000) / 1000;

    const actualCategories = categories.length > 0
      ? categories
      : this.getDefaultCategories();
    const categoriesKey = actualCategories.sort().join(",");

    return `${roundedLat},${roundedLon},${radiusMeters},${categoriesKey}`;
  }

  private isCacheValid(
    cached: CachedPlaces,
    coordinate: { latitude: number; longitude: number },
  ): boolean {
    // Check time-based expiration
    const timeSinceCache = Date.now() - cached.timestamp.getTime();
    if (timeSinceCache > this.config.cacheValidDuration) {
      return false;
    }

    // Check location-based expiration
    const distance = this.calculateDistance(
      cached.coordinate.latitude,
      cached.coordinate.longitude,
      coordinate.latitude,
      coordinate.longitude,
    );
    return distance <= this.config.locationToleranceMeters;
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, cached] of this.placesCache) {
      const timeSinceCache = now - cached.timestamp.getTime();
      if (timeSinceCache > this.config.cacheValidDuration) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      for (const key of keysToRemove) {
        this.placesCache.delete(key);
      }
      console.log(`📍 Cleaned up ${keysToRemove.length} expired cache entries`);
    }
  }

  private getDefaultCategories(): string[] {
    return PlaceCategorization.getPrioritizedCategories();
  }

  private buildOverpassQuery(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number,
    categories: string[],
  ): string {
    const { latitude: lat, longitude: lon } = coordinate;

    const actualCategories = categories.length > 0
      ? categories
      : this.getDefaultCategories();

    // Build query parts for each category
    const queryParts: string[] = [];
    for (const category of actualCategories) {
      // Query both nodes and ways with names and address tags
      queryParts.push(
        `node[${category}]["name"](around:${radiusMeters},${lat},${lon});`,
      );
      queryParts.push(
        `way[${category}]["name"](around:${radiusMeters},${lat},${lon});`,
      );
    }

    const query = `[out:json][timeout:${
      Math.floor(this.config.timeout / 1000)
    }];
(
  ${queryParts.join("\n  ")}
);
out center tags;`;

    return query;
  }

  private buildRequest(query: string): Request {
    const url = new URL(this.config.baseURL);

    const body = new URLSearchParams();
    body.append("data", query);

    return new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.config.userAgent,
      },
      body,
    });
  }

  private parseElement(element: OverpassElement): Place | null {
    const elementType = element.type;
    const name = element.tags?.["name"];

    if (!name || name.trim() === "") {
      return null;
    }

    // Handle coordinates
    let latitude: number;
    let longitude: number;

    if (element.lat !== undefined && element.lon !== undefined) {
      latitude = element.lat;
      longitude = element.lon;
    } else if (element.center) {
      latitude = element.center.lat;
      longitude = element.center.lon;
    } else {
      return null;
    }

    const tags = element.tags || {};

    // Extract address from OSM tags (same logic as Swift)
    const address = this.extractAddressFromTags(tags);

    // Determine category and group
    const { category, categoryGroup, icon } = this.extractCategoryInfo(tags);

    return {
      id: `${elementType}:${element.id}`,
      elementType: elementType as "node" | "way" | "relation",
      elementId: element.id,
      name,
      latitude,
      longitude,
      tags,
      address,
      category,
      categoryGroup,
      icon,
    };
  }

  /**
   * Extract address components from OSM tags (matches Swift implementation)
   */
  private extractAddressFromTags(
    tags: Record<string, string>,
  ): CommunityAddressRecord {
    // Extract street address
    let street: string | undefined;
    if (tags["addr:street"]) {
      if (tags["addr:housenumber"]) {
        street = `${tags["addr:housenumber"]} ${tags["addr:street"]}`;
      } else {
        street = tags["addr:street"];
      }
    }

    return {
      $type: "community.lexicon.location.address",
      name: tags["name"],
      street,
      locality: tags["addr:city"] || tags["place"] || tags["addr:locality"],
      region: tags["addr:state"] || tags["addr:region"],
      country: tags["addr:country"],
      postalCode: tags["addr:postcode"] || tags["addr:postal_code"],
    };
  }

  /**
   * Extract category information from OSM tags
   */
  private extractCategoryInfo(tags: Record<string, string>): {
    category?: string;
    categoryGroup?: PlaceCategoryGroup;
    icon: string;
  } {
    // Look for primary category tags in order of priority
    const primaryTags = ["amenity", "leisure", "shop", "tourism"];

    for (const tag of primaryTags) {
      const value = tags[tag];
      if (value) {
        const categoryGroup = PlaceCategorization.getCategoryGroup(tag, value);
        const icon = PlaceCategorization.getIcon(tag, value);

        return {
          category: value,
          categoryGroup: categoryGroup || undefined,
          icon,
        };
      }
    }

    return { icon: "📍" };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Format distance for display
   */
  private formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    } else {
      return `${(meters / 1000).toFixed(1)}km`;
    }
  }
}
