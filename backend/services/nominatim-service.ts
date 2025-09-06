// Nominatim reverse geocoding and search service for better locality resolution
// Used for geographic areas (parks, beaches, etc.) that lack precise address data
// Also provides search functionality for free-form place queries

import {
  CommunityAddressRecord,
  PlaceWithDistance,
} from "../models/place-models.ts";

export interface NominatimAddress {
  amenity?: string;
  leisure?: string;
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string; // ISO 3166-1 alpha-2 code
  postcode?: string;
}

export interface NominatimResponse {
  place_id?: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
  boundingbox?: string[];
}

export interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance?: number;
  address?: NominatimAddress;
  boundingbox?: string[];
}

export interface NominatimServiceConfig {
  baseURL: string;
  userAgent: string;
  timeout: number;
  rateLimitDelay: number; // Nominatim requires 1 request per second max
}

export class NominatimService {
  private readonly config: NominatimServiceConfig;
  private lastRequestTime = 0;

  constructor(config?: Partial<NominatimServiceConfig>) {
    // Allow configurable Nominatim instance via environment variable
    const baseURL = Deno.env.get("NOMINATIM_BASE_URL") ||
      "https://nominatim.geocoding.ai";

    console.log(`🌐 NominatimService configured with baseURL: ${baseURL}`);

    this.config = {
      baseURL,
      userAgent:
        "Anchor-AppView/1.0 (atproto check-in app; https://dropanchor.app)",
      timeout: 15000, // 15 seconds (increased for reliability)
      rateLimitDelay: 1100, // 1.1 seconds between requests (slightly over 1/sec)
      ...config,
    };
  }

  /**
   * Reverse geocode coordinates to get address information
   */
  async reverseGeocode(
    coordinate: { latitude: number; longitude: number },
  ): Promise<CommunityAddressRecord | null> {
    await this.enforceRateLimit();

    const url = new URL(`${this.config.baseURL}/reverse`);
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", coordinate.latitude.toString());
    url.searchParams.set("lon", coordinate.longitude.toString());
    url.searchParams.set("zoom", "18"); // High detail level
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("email", "hello@dropanchor.app"); // Required attribution

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout,
      );

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": this.config.userAgent,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limit exceeded");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NominatimResponse = await response.json();

      if (!data.address) {
        return null;
      }

      return this.parseNominatimAddress(data.address);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    }
  }

  /**
   * Convert Nominatim address format to our CommunityAddressRecord format
   */
  private parseNominatimAddress(
    address: NominatimAddress,
  ): CommunityAddressRecord {
    // Build street address from components
    let street: string | undefined;
    if (address.road) {
      street = address.house_number
        ? `${address.house_number} ${address.road}`
        : address.road;
    }

    // Smart locality selection using Nominatim's hierarchy
    // Priority: town > city > village > municipality > suburb
    const locality = address.town ||
      address.city ||
      address.village ||
      address.municipality ||
      address.suburb;

    // Region mapping (state/province)
    const region = address.state;

    // Use ISO country code (uppercase for standard format)
    const country = address.country_code?.toUpperCase();

    return {
      $type: "community.lexicon.location.address",
      name: address.amenity || address.leisure, // For named venues
      street,
      locality,
      region,
      country,
      postalCode: address.postcode,
    };
  }

  /**
   * Search for places by query with geographic bounds
   */
  async searchPlaces(
    query: string,
    center: { latitude: number; longitude: number },
    options?: {
      country?: string;
      limit?: number;
      radiusKm?: number;
    },
  ): Promise<PlaceWithDistance[]> {
    await this.enforceRateLimit();

    const { country, limit = 10 } = options || {};

    // Try to get city name for location context, but fall back gracefully
    let locationQuery = query; // Default to original query

    try {
      const reverseResult = await this.reverseGeocode(center);
      const cityName = reverseResult?.locality;
      if (cityName && cityName !== "unknown") {
        locationQuery = `${query} near ${cityName}`;
        console.log(`🎯 Using location-aware query: "${locationQuery}"`);
      } else {
        console.log(`⚠️ No city name found, using direct query: "${query}"`);
      }
    } catch (error) {
      console.warn(
        "Failed to get city name for search context, using direct query:",
        error,
      );
    }

    const url = new URL(`${this.config.baseURL}/search`);
    url.searchParams.set("format", "json");
    url.searchParams.set("q", locationQuery); // Use location-aware query
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", Math.min(limit, 25).toString());
    url.searchParams.set("email", "hello@dropanchor.app");

    if (country) {
      url.searchParams.set("countrycodes", country.toLowerCase());
    }

    // Add viewbox for location-specific search (4x4km as originally requested)
    const radiusKm = 2; // 2km radius = 4km x 4km box
    const latOffset = radiusKm / 111; // Rough km to degree conversion for lat
    const lngOffset = radiusKm /
      (111 * Math.cos(center.latitude * Math.PI / 180)); // Adjust for longitude

    const viewbox = [
      center.longitude - lngOffset, // left (min longitude)
      center.latitude + latOffset, // top (max latitude)
      center.longitude + lngOffset, // right (max longitude)
      center.latitude - latOffset, // bottom (min latitude)
    ].join(",");

    url.searchParams.set("viewbox", viewbox);
    url.searchParams.set("bounded", "1"); // Only return results within viewbox

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => {
          console.warn(
            `Nominatim search timeout after ${this.config.timeout}ms for query: "${query}"`,
          );
          controller.abort();
        },
        this.config.timeout,
      );

      console.log(
        `🌐 Nominatim search: "${query}" near ${center.latitude},${center.longitude}`,
      );
      const startTime = Date.now();

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": this.config.userAgent,
        },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      console.log(
        `📊 Nominatim response: ${response.status} (${responseTime}ms)`,
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limit exceeded - try again in a few seconds");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NominatimSearchResult[] = await response.json();

      // Convert to Place objects with distance
      const places = data
        .filter((result) => result.lat && result.lon) // Filter out results without coordinates
        .map((result): PlaceWithDistance => {
          const latitude = parseFloat(result.lat);
          const longitude = parseFloat(result.lon);
          const distanceMeters = this.calculateDistance(
            center.latitude,
            center.longitude,
            latitude,
            longitude,
          ) * 1000; // Convert km to meters

          // Generate a unique ID
          const id = `${result.osm_type}:${result.osm_id}`;

          // Extract name from display_name or use OSM tags
          const name = this.extractPlaceName(result);

          // Parse address from Nominatim address
          const address = result.address
            ? this.parseNominatimAddress(result.address)
            : {
              $type: "community.lexicon.location.address" as const,
              locality: this.extractLocalityFromDisplayName(
                result.display_name,
              ),
            };

          // Determine icon based on OSM class/type
          const icon = this.getIconForOsmClassType(result.class, result.type);

          return {
            id,
            elementType: result.osm_type === "node"
              ? "node"
              : result.osm_type === "way"
              ? "way"
              : "relation",
            elementId: result.osm_id,
            name,
            latitude,
            longitude,
            tags: { class: result.class, type: result.type }, // Minimal tags from search
            address,
            category: result.type,
            icon,
            distanceMeters,
            formattedDistance: this.formatDistance(distanceMeters),
          };
        })
        .sort((a, b) => a.distanceMeters - b.distanceMeters); // Sort by distance

      console.log(
        `✅ Nominatim search completed: ${places.length} places found`,
      );
      return places;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(
          `⏰ Nominatim search timeout for "${query}" after ${this.config.timeout}ms`,
        );
        throw new Error(
          `Search timeout after ${
            this.config.timeout / 1000
          } seconds - Nominatim may be slow, try again`,
        );
      }
      console.error(`❌ Nominatim search error for "${query}":`, error);
      throw error;
    }
  }

  /**
   * Extract a clean place name from Nominatim search result
   */
  private extractPlaceName(result: NominatimSearchResult): string {
    // For amenities and leisure facilities, the display name often starts with the venue name
    const parts = result.display_name.split(",");
    const firstPart = parts[0]?.trim();

    // If it looks like a venue name (not a generic address), use it
    if (firstPart && !firstPart.match(/^\d+/)) { // Doesn't start with a number (street address)
      return firstPart;
    }

    // Fallback to class/type-based naming
    return this.getGenericNameForClassType(result.class, result.type);
  }

  /**
   * Extract locality from display_name when address details are missing
   */
  private extractLocalityFromDisplayName(
    displayName: string,
  ): string | undefined {
    const parts = displayName.split(",").map((p) => p.trim());
    // Usually locality is the second-to-last part before country
    if (parts.length >= 3) {
      return parts[parts.length - 2];
    }
    return undefined;
  }

  /**
   * Get appropriate icon for OSM class/type
   */
  private getIconForOsmClassType(osmClass: string, osmType: string): string {
    const iconMap: Record<string, string> = {
      // Amenities
      "amenity:restaurant": "🍽️",
      "amenity:cafe": "☕",
      "amenity:bar": "🍺",
      "amenity:pub": "🍻",
      "amenity:fast_food": "🍔",
      "amenity:bank": "🏦",
      "amenity:hospital": "🏥",
      "amenity:pharmacy": "💊",
      "amenity:fuel": "⛽",
      "amenity:school": "🏫",
      "amenity:library": "📚",
      "amenity:post_office": "📮",
      "amenity:place_of_worship": "⛪",
      // Tourism
      "tourism:attraction": "🎯",
      "tourism:museum": "🏛️",
      "tourism:hotel": "🏨",
      "tourism:guest_house": "🏠",
      // Natural features
      "natural:peak": "⛰️",
      "natural:beach": "🏖️",
      "natural:forest": "🌲",
      "natural:lake": "🏞️",
      "natural:park": "🌳",
      // Leisure
      "leisure:park": "🌳",
      "leisure:sports_centre": "🏋️",
      "leisure:swimming_pool": "🏊",
      "leisure:playground": "🛝",
    };

    return iconMap[`${osmClass}:${osmType}`] || "📍";
  }

  /**
   * Generate generic name for class/type when specific name is unavailable
   */
  private getGenericNameForClassType(
    osmClass: string,
    osmType: string,
  ): string {
    const nameMap: Record<string, string> = {
      "amenity:restaurant": "Restaurant",
      "amenity:cafe": "Cafe",
      "amenity:bar": "Bar",
      "amenity:pub": "Pub",
      "amenity:fast_food": "Fast Food",
      "amenity:bank": "Bank",
      "amenity:hospital": "Hospital",
      "amenity:pharmacy": "Pharmacy",
      "amenity:fuel": "Gas Station",
      "amenity:school": "School",
      "amenity:library": "Library",
      "tourism:attraction": "Attraction",
      "tourism:museum": "Museum",
      "tourism:hotel": "Hotel",
      "natural:peak": "Mountain Peak",
      "natural:beach": "Beach",
      "natural:forest": "Forest",
      "natural:lake": "Lake",
      "leisure:park": "Park",
      "leisure:sports_centre": "Sports Center",
    };

    return nameMap[`${osmClass}:${osmType}`] ||
      `${
        osmType.charAt(0).toUpperCase() + osmType.slice(1).replace(/_/g, " ")
      }`;
  }

  /**
   * Calculate distance between two coordinates in kilometers
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
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

  /**
   * Enforce rate limiting (1 request per second max for Nominatim)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.config.rateLimitDelay) {
      const delay = this.config.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }
}
