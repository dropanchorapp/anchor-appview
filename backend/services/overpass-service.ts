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
import { NominatimService } from "./nominatim-service.ts";

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
  private readonly nominatimService: NominatimService;

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
    this.nominatimService = new NominatimService();
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
      const rawPlaces = overpassResponse.elements
        .map((element) => this.parseElement(element))
        .filter((place): place is Place => place !== null);

      // Deduplicate places by their unique ID (elementType:elementId)
      const places = this.deduplicatePlaces(rawPlaces);

      // Cache the results (no enhancement during discovery for speed)
      const cachedPlaces: CachedPlaces = {
        places: places,
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
   * Get enhanced address information for a specific place
   * Uses Nominatim for geographic areas, Overpass data for venues
   */
  async getEnhancedAddress(place: Place): Promise<CommunityAddressRecord> {
    // For geographic areas, always use Nominatim for better locality resolution
    if (this.isGeographicArea(place)) {
      try {
        console.log(`🌍 Using Nominatim for geographic area: ${place.name}`);
        const nominatimAddress = await this.nominatimService.reverseGeocode({
          latitude: place.latitude,
          longitude: place.longitude,
        });

        if (nominatimAddress) {
          return {
            ...nominatimAddress,
            name: place.name, // Keep the original place name
          };
        }
      } catch (error) {
        console.warn(
          `Nominatim failed for ${place.name}, falling back to OSM admin boundaries:`,
          error,
        );
        // Fall through to admin boundary fallback
      }
    }

    // If place already has good address data (venues), use it
    if (this.isVenueWithGoodAddress(place)) {
      return place.address;
    }

    // Fallback: use our current OSM administrative boundary logic
    console.log(`🏛️ Using admin boundaries fallback for: ${place.name}`);
    const adminData = await this.resolveAdministrativeBoundaries({
      latitude: place.latitude,
      longitude: place.longitude,
    });

    return {
      $type: "community.lexicon.location.address",
      name: place.name,
      locality: place.address?.locality || adminData.locality,
      country: place.address?.country || adminData.country,
      street: place.address?.street,
      region: place.address?.region,
      postalCode: place.address?.postalCode,
    };
  }

  /**
   * Clear all cached places data
   */
  clearCache(): void {
    this.placesCache.clear();
    console.log("📍 Cleared all cached places");
  }

  // MARK: - Private Methods

  /**
   * Check if a place is a venue with good address data
   */
  private isVenueWithGoodAddress(place: Place): boolean {
    // Has direct address components (street address indicates a specific venue)
    if (place.address?.street && place.address?.locality) {
      return true;
    }

    // Is a business/venue type likely to have good address data
    const venueCategories = [
      "restaurant",
      "cafe",
      "bar",
      "pub",
      "fast_food",
      "shop",
      "supermarket",
      "bank",
      "pharmacy",
      "hospital",
      "hotel",
      "gas_station",
      "cinema",
      "theatre",
      "library",
      "fitness_centre",
      "sports_centre", // Indoor venues with addresses
    ];

    // Must have both category match AND some address data
    return !!(place.category && venueCategories.includes(place.category) &&
      (place.address?.street || place.address?.locality));
  }

  /**
   * Check if a place is a geographic area that would benefit from Nominatim
   */
  private isGeographicArea(place: Place): boolean {
    const geographicCategories = [
      "park",
      "playground",
      "garden",
      "nature_reserve",
      "beach",
      "swimming_pool",
      "pitch", // Outdoor sports areas
      "golf_course",
      "marina",
      "pier",
      "attraction",
      "viewpoint",
      "monument",
      "memorial",
      "mountain_peak",
      "hill",
      "forest",
      "lake",
      "river",
    ];

    return place.category
      ? geographicCategories.includes(place.category)
      : false;
  }

  /**
   * Remove duplicate places based on their unique ID (elementType:elementId)
   * Keeps the first occurrence when duplicates are found
   */
  private deduplicatePlaces(places: Place[]): Place[] {
    const seenIds = new Set<string>();
    const uniquePlaces: Place[] = [];

    for (const place of places) {
      if (!seenIds.has(place.id)) {
        seenIds.add(place.id);
        uniquePlaces.push(place);
      }
    }

    const duplicatesRemoved = places.length - uniquePlaces.length;
    if (duplicatesRemoved > 0) {
      console.log(`📍 Removed ${duplicatesRemoved} duplicate places`);
    }

    return uniquePlaces;
  }

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
   * Extract address components from OSM tags with comprehensive field mapping
   */
  private extractAddressFromTags(
    tags: Record<string, string>,
  ): CommunityAddressRecord {
    // Extract street address with full house number + street combination
    let street: string | undefined;
    if (tags["addr:street"]) {
      if (tags["addr:housenumber"]) {
        street = `${tags["addr:housenumber"]} ${tags["addr:street"]}`;
      } else {
        street = tags["addr:street"];
      }
    }

    // Extract locality with comprehensive fallback chain
    const locality = tags["addr:city"] ||
      tags["addr:locality"] ||
      tags["place"] ||
      tags["addr:municipality"] ||
      tags["addr:town"] ||
      tags["addr:village"];

    // Extract region with comprehensive state/province/region mapping
    const region = tags["addr:state"] ||
      tags["addr:region"] ||
      tags["addr:province"] ||
      tags["is_in:state"] ||
      tags["is_in:state_code"];

    // Extract country (OSM uses ISO 3166-1 alpha-2 codes)
    const country = tags["addr:country"] ||
      tags["addr:country_code"] ||
      tags["is_in:country"] ||
      tags["is_in:country_code"];

    // Extract postal code with various field name variants
    const postalCode = tags["addr:postcode"] ||
      tags["addr:postal_code"] ||
      tags["postal_code"];

    return {
      $type: "community.lexicon.location.address",
      name: tags["name"],
      street,
      locality,
      region,
      country,
      postalCode,
    };
  }

  /**
   * Enhance places that lack locality/country with administrative boundary data
   */
  private async enhancePlacesWithAdministrativeData(
    places: Place[],
  ): Promise<Place[]> {
    // Group places by missing data and coordinates for efficient batch processing
    const placesNeedingEnhancement = places.filter((place) =>
      !place.address?.locality || !place.address?.country
    );

    if (placesNeedingEnhancement.length === 0) {
      return places;
    }

    // For simplicity, we'll resolve administrative data for the first place
    // and apply it to all places in the same general area (this assumes
    // places are geographically close, which is true for our radius queries)
    const firstPlace = placesNeedingEnhancement[0];
    const adminData = await this.resolveAdministrativeBoundaries({
      latitude: firstPlace.latitude,
      longitude: firstPlace.longitude,
    });

    // Apply the administrative data to places that need it
    return places.map((place) => {
      if (!place.address?.locality || !place.address?.country) {
        return {
          ...place,
          address: {
            ...place.address,
            locality: place.address?.locality || adminData.locality,
            country: place.address?.country || adminData.country,
          },
        };
      }
      return place;
    });
  }

  /**
   * Resolve administrative boundaries for places lacking direct address tags
   * This helps get locality/country for parks, monuments, and other POIs
   */
  private async resolveAdministrativeBoundaries(
    coordinate: { latitude: number; longitude: number },
  ): Promise<{ locality?: string; country?: string }> {
    const query = `[out:json][timeout:10];
(
  // District/neighborhood level (admin_level=10) - most precise locality  
  relation["boundary"="administrative"]["admin_level"="10"](around:2000,${coordinate.latitude},${coordinate.longitude});
  // Nearby place nodes for cross-reference
  node["place"~"^(city|town|village)$"](around:5000,${coordinate.latitude},${coordinate.longitude});
  // Municipality level (admin_level=8) - broader area
  relation["boundary"="administrative"]["admin_level"="8"](around:5000,${coordinate.latitude},${coordinate.longitude});
  // County/state level (admin_level=6) - for metro areas
  relation["boundary"="administrative"]["admin_level"="6"](around:10000,${coordinate.latitude},${coordinate.longitude});
  // Country level (admin_level=2)
  relation["boundary"="administrative"]["admin_level"="2"](around:50000,${coordinate.latitude},${coordinate.longitude});
);
out tags;`;

    try {
      const request = this.buildRequest(query);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(request, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const overpassResponse: OverpassResponse = await response.json();
      const elements = overpassResponse.elements;

      let locality: string | undefined;
      let country: string | undefined;

      // Collect admin boundaries by level for smarter selection
      const admin10Districts: string[] = [];
      const admin8Municipalities: string[] = [];
      const admin6Counties: string[] = [];
      const nearbyPlaces: string[] = [];

      for (const element of elements) {
        const adminLevel = element.tags?.["admin_level"];
        const name = element.tags?.["name"];

        if (adminLevel === "10" && name) {
          admin10Districts.push(name);
        } else if (adminLevel === "8" && name) {
          admin8Municipalities.push(name);
        } else if (adminLevel === "6" && name && !name.includes("County")) {
          admin6Counties.push(name);
        } else if (element.tags?.["place"] && name) {
          const placeType = element.tags["place"];
          if (["city", "town", "village"].includes(placeType)) {
            nearbyPlaces.push(name);
          }
        } else if (adminLevel === "2" && !country) {
          country = element.tags?.["ISO3166-1"] ||
            element.tags?.["country_code"];
        }
      }

      // Smart locality selection with preference for specific districts
      if (admin10Districts.length > 0) {
        // Prefer district names that are NOT the same as municipality names
        const specificDistricts = admin10Districts.filter((district) =>
          !admin8Municipalities.some((muni) => district === muni)
        );
        locality = specificDistricts.length > 0
          ? specificDistricts[0]
          : admin10Districts[0];
      } else if (nearbyPlaces.length > 0) {
        locality = nearbyPlaces[0];
      } else if (admin8Municipalities.length > 0) {
        locality = admin8Municipalities[0];
      } else if (admin6Counties.length > 0) {
        locality = admin6Counties[0];
      }

      return { locality, country };
    } catch (error) {
      console.warn("Failed to resolve administrative boundaries:", error);
      return {};
    }
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
