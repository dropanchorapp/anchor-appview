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
import { CategoryService } from "./category-service.ts";
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
    return placesWithDistance.sort(
      (a, b) => a.distanceMeters - b.distanceMeters,
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

    // Always enhance addresses that are missing critical country/region data
    // Even venues with "good" address data might be missing these fields
    const needsEnhancement = !place.address?.country || !place.address?.region;

    if (this.isVenueWithGoodAddress(place) && !needsEnhancement) {
      console.log(`✅ Using complete venue address for: ${place.name}`);
      return place.address;
    }

    // Enhance with administrative boundary data
    console.log(
      `🏛️ Enhancing address with admin boundaries for: ${place.name}`,
    );
    const adminData = await this.resolveAdministrativeBoundaries({
      latitude: place.latitude,
      longitude: place.longitude,
    });

    // Build final address with proper fallbacks
    const finalAddress: CommunityAddressRecord = {
      $type: "community.lexicon.location.address",
      name: place.name,
    };

    // Only include fields that have actual values
    const locality = place.address?.locality || adminData.locality;
    const region = place.address?.region || adminData.region;
    const country = place.address?.country || adminData.country;
    const street = place.address?.street;
    const postalCode = place.address?.postalCode;

    if (locality) finalAddress.locality = locality;
    if (region) finalAddress.region = region;
    if (country) finalAddress.country = country;
    if (street) finalAddress.street = street;
    if (postalCode) finalAddress.postalCode = postalCode;

    // Log what we resolved for debugging
    console.log(`📍 Final address for ${place.name}:`, {
      locality: locality || "missing",
      region: region || "missing",
      country: country || "missing",
      adminDataReceived: Object.keys(adminData).length > 0,
    });

    return finalAddress;
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
   * Check if a place is a venue with good address data that doesn't need expensive geocoding
   */
  private isVenueWithGoodAddress(place: Place): boolean {
    // Has direct address components (street address indicates a specific venue)
    if (place.address?.street && place.address?.locality) {
      return true;
    }

    // Check if this category type should use venue address strategy
    if (!place.category) return false;

    const shouldUseVenueStrategy = CategoryService
      .shouldUseVenueAddressStrategy(place.category);

    // Must have both venue category type AND some address data
    return !!(
      shouldUseVenueStrategy &&
      (place.address?.street || place.address?.locality)
    );
  }

  /**
   * Check if a place is a geographic area that would benefit from Nominatim
   */
  private isGeographicArea(place: Place): boolean {
    if (!place.category) return false;

    return CategoryService.shouldUseGeographicAddressStrategy(place.category);
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
    return CategoryService.getDefaultSearchCategories();
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

    // Build query parts for each category - nodes only for speed
    // Use compact union syntax without newlines
    const queryParts: string[] = [];
    for (const category of actualCategories) {
      // Query nodes, ways, and relations (nwr) to find all place types
      // This is important for large landmarks (ways) and complex areas (relations)
      queryParts.push(
        `nwr[${category}]["name"](around:${radiusMeters},${lat},${lon});`,
      );
    }

    // Ultra-compact query format
    const query = `[out:json][timeout:${
      Math.floor(
        this.config.timeout / 1000,
      )
    }];(${queryParts.join("")});out qt;`;

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

    // Handle coordinates - nodes only now
    if (element.lat === undefined || element.lon === undefined) {
      return null;
    }

    const latitude = element.lat;
    const longitude = element.lon;

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
    const postalCode = tags["addr:postcode"] || tags["addr:postal_code"] ||
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
    const placesNeedingEnhancement = places.filter(
      (place) => !place.address?.locality || !place.address?.country,
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
            region: place.address?.region || adminData.region,
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
   * Ultra-simplified version to avoid timeouts
   */
  private async resolveAdministrativeBoundaries(coordinate: {
    latitude: number;
    longitude: number;
  }): Promise<{ locality?: string; region?: string; country?: string }> {
    // Query for all relevant administrative levels (2-8)
    // Level 2: Country
    // Level 3-6: Region/State/Province/County
    // Level 7-8: Municipality/City/Town
    const query =
      `[out:json][timeout:10];is_in(${coordinate.latitude},${coordinate.longitude});area._[admin_level~"^[2-8]$"];out tags qt;`;

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

      // Store all found admin boundaries by level
      const adminBoundaries = new Map<string, string>();
      let countryCode = "";

      for (const element of elements) {
        const name = element.tags?.["name"];
        if (!name) continue;

        // Strictly allow only administrative boundaries
        const boundaryType = element.tags?.["boundary"];
        if (boundaryType !== "administrative") {
          continue;
        }

        const level = element.tags?.["admin_level"];
        if (level) {
          let value = name;

          // For country (Level 2), prefer ISO code or English name
          if (level === "2") {
            value = element.tags?.["ISO3166-1"] ||
              element.tags?.["ISO3166-1:alpha2"] ||
              element.tags?.["name:en"] ||
              name;

            countryCode = element.tags?.["ISO3166-1"] ||
              element.tags?.["ISO3166-1:alpha2"] ||
              "";
          }

          adminBoundaries.set(level, value);
        }
      }

      // Country-specific admin level configuration
      // Maps ISO 3166-1 alpha-2 code to { region: level, locality: level }
      const countryConfig: Record<
        string,
        { region: string; locality: string }
      > = {
        // Default fallback
        default: { region: "4", locality: "8" },

        // North America
        US: { region: "4", locality: "8" }, // State, City/Town
        CA: { region: "4", locality: "8" }, // Province, Municipality
        MX: { region: "4", locality: "8" }, // Estado, Municipio

        // Europe
        GB: { region: "6", locality: "8" }, // County/Unitary, District
        DE: { region: "4", locality: "8" }, // Bundesland, Gemeinde
        FR: { region: "4", locality: "8" }, // Région, Commune
        ES: { region: "4", locality: "8" }, // Comunidad Autónoma, Municipio
        IT: { region: "4", locality: "8" }, // Regione, Comune
        NL: { region: "4", locality: "8" }, // Provincie, Gemeente
        BE: { region: "4", locality: "8" }, // Gewest/Région, Gemeente/Commune
        CH: { region: "4", locality: "8" }, // Kanton, Gemeinde
        AT: { region: "4", locality: "8" }, // Bundesland, Gemeinde
        PL: { region: "4", locality: "8" }, // Województwo, Gmina
        SE: { region: "4", locality: "7" }, // Län, Kommun
        NO: { region: "4", locality: "7" }, // Fylke, Kommune
        DK: { region: "4", locality: "7" }, // Region, Kommune
        FI: { region: "4", locality: "8" }, // Maakunta, Kunta
        IE: { region: "6", locality: "8" }, // County (Level 6), Local Area

        // Asia / Pacific
        JP: { region: "4", locality: "7" }, // Prefecture, Municipality/Ward
        CN: { region: "4", locality: "6" }, // Province, Prefecture-level city
        IN: { region: "4", locality: "8" }, // State, District/City
        AU: { region: "4", locality: "7" }, // State, LGA
        NZ: { region: "4", locality: "8" }, // Region, Territorial Authority
        KR: { region: "4", locality: "7" }, // Province, City/County

        // South America
        BR: { region: "4", locality: "8" }, // Estado, Município
        AR: { region: "4", locality: "8" }, // Provincia, Municipio
        CL: { region: "4", locality: "8" }, // Región, Comuna

        // Africa
        ZA: { region: "4", locality: "8" }, // Province, Municipality
        EG: { region: "4", locality: "8" }, // Governorate, City
      };

      const config = countryConfig[countryCode] || countryConfig["default"];
      const regionLevel = config.region;
      const localityLevel = config.locality;

      const country = adminBoundaries.get("2");

      // Resolve Region
      // Try target level, then fallback to adjacent levels if missing
      let region = adminBoundaries.get(regionLevel);
      if (!region) {
        // Fallback heuristics for region
        region = adminBoundaries.get("3") ||
          adminBoundaries.get("5") ||
          adminBoundaries.get("6");
      }

      // Resolve Locality
      // Try target level, then fallback
      let locality = adminBoundaries.get(localityLevel);
      if (!locality) {
        // Fallback heuristics for locality
        locality = adminBoundaries.get("7") ||
          adminBoundaries.get("9") ||
          adminBoundaries.get("10");
      }

      console.log(
        `🏛️ Admin boundary result for ${coordinate.latitude},${coordinate.longitude} (${
          countryCode || "unknown"
        }):`,
        {
          locality: locality || "not found",
          region: region || "not found",
          country: country || "not found",
          elementsFound: elements.length,
          levelsFound: Array.from(adminBoundaries.keys()).sort(),
        },
      );

      return { locality, region, country };
    } catch (error) {
      console.error("Failed to resolve administrative boundaries:", error);
      console.error("Query coordinate:", coordinate);
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
        const categoryGroup = CategoryService.getCategoryGroup(tag, value);
        const icon = CategoryService.getIcon(tag, value);

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
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
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
