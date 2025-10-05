/**
 * LocationIQ Nearby POI API service
 * https://docs.locationiq.com/reference/nearby-poi-api
 */

import type { CommunityAddressRecord, Place } from "../models/place-models.ts";
import { CategoryService } from "./category-service.ts";

interface LocationIQNearbyResult {
  place_id: number | string; // Can be number or string from API
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  class: string;
  type: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
  };
  extratags?: Record<string, string>;
  distance?: number; // Distance in meters
}

export class LocationIQService {
  private readonly apiKey: string;
  private readonly baseURL = "https://us1.locationiq.com/v1";
  private readonly cache: Map<string, { data: Place[]; timestamp: number }>;
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    const apiKey = Deno.env.get("LOCATION_IQ_TOKEN");
    if (!apiKey) {
      throw new Error(
        "LOCATION_IQ_TOKEN environment variable is required for LocationIQ provider",
      );
    }
    this.apiKey = apiKey;
    this.cache = new Map();

    debugPrint("LocationIQ service initialized");
  }

  async findNearbyPlaces(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number = 300,
    _categories: string[] = [], // Ignored - always use tag=all
  ): Promise<Place[]> {
    // Check cache with geo-tolerance (~100m = 0.001 degrees)
    const cacheKey = this.getCacheKey(coordinate, radiusMeters);
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      debugPrint(`LocationIQ cache hit: ${cacheKey}`);
      return cached.data;
    }

    // Build API request
    const params = new URLSearchParams({
      key: this.apiKey,
      lat: coordinate.latitude.toString(),
      lon: coordinate.longitude.toString(),
      tag: "all", // Always return all POIs
      radius: Math.min(radiusMeters, 30000).toString(), // Max 30km per LocationIQ
      limit: "50", // Max results
      format: "json",
    });

    const url = `${this.baseURL}/nearby?${params}`;

    try {
      debugPrint(
        `LocationIQ API request: ${coordinate.latitude},${coordinate.longitude} radius=${radiusMeters}m`,
      );

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            "LocationIQ rate limit exceeded - try again later or use provider=overpass",
          );
        }
        if (response.status === 401) {
          throw new Error("LocationIQ API key invalid");
        }
        throw new Error(
          `LocationIQ API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: LocationIQNearbyResult[] = await response.json();
      debugPrint(`LocationIQ returned ${data.length} places`);

      const places = data.map((item) => this.parseLocationIQResult(item));

      // Cache results
      this.cache.set(cacheKey, { data: places, timestamp: Date.now() });

      return places;
    } catch (error) {
      console.error("LocationIQ API error:", error);
      throw error;
    }
  }

  private parseLocationIQResult(item: LocationIQNearbyResult): Place {
    const latitude = parseFloat(item.lat);
    const longitude = parseFloat(item.lon);

    // Parse place_id to number (handles both string and number from API)
    const placeId = typeof item.place_id === "string"
      ? parseInt(item.place_id, 10)
      : item.place_id;

    // Extract name from display_name if name field is empty
    const name = item.name || item.display_name.split(",")[0]?.trim() ||
      "Unknown Place";

    // Parse address to CommunityAddressRecord format
    const address: CommunityAddressRecord = {
      $type: "community.lexicon.location.address",
      name: item.name,
      street: item.address?.road
        ? item.address.house_number
          ? `${item.address.house_number} ${item.address.road}`
          : item.address.road
        : undefined,
      locality: item.address?.city || item.address?.town ||
        item.address?.village,
      region: item.address?.state,
      country: item.address?.country_code?.toUpperCase(),
      postalCode: item.address?.postcode,
    };

    // Build OSM-compatible tags
    const tags: Record<string, string> = {
      [item.class]: item.type,
      ...item.extratags,
    };

    // Get category and icon from CategoryService
    const categoryGroup = CategoryService.getCategoryGroup(
      item.class,
      item.type,
    );
    const icon = CategoryService.getIcon(item.class, item.type);

    return {
      id: `locationiq:${placeId}`,
      elementType: "node", // LocationIQ returns point data
      elementId: placeId, // Always a number for JSON compatibility
      name,
      latitude,
      longitude,
      tags,
      address,
      category: item.type,
      categoryGroup,
      icon,
    };
  }

  private getCacheKey(
    coordinate: { latitude: number; longitude: number },
    radius: number,
  ): string {
    // Round coordinates to ~100m precision (0.001 degrees)
    const lat = Math.round(coordinate.latitude * 1000) / 1000;
    const lng = Math.round(coordinate.longitude * 1000) / 1000;
    return `locationiq:${lat},${lng}:${radius}`;
  }
}

function debugPrint(message: string) {
  console.log(`[LocationIQ] ${message}`);
}
