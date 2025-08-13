// Nominatim reverse geocoding service for better locality resolution
// Used for geographic areas (parks, beaches, etc.) that lack precise address data

import { CommunityAddressRecord } from "../models/place-models.ts";

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
    this.config = {
      baseURL: "https://nominatim.openstreetmap.org",
      userAgent:
        "Anchor-AppView/1.0 (atproto check-in app; https://dropanchor.app)",
      timeout: 10000, // 10 seconds
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

    // Country standardization
    let country = address.country;
    if (country) {
      country = this.standardizeCountryName(country);
    }

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
   * Standardize country names to ISO 3166-1 alpha-2 codes
   */
  private standardizeCountryName(country: string): string {
    const countryMap: Record<string, string> = {
      "Nederland": "NL",
      "United States": "US",
      "United Kingdom": "GB",
      "Deutschland": "DE",
      "France": "FR",
      "España": "ES",
      "Italia": "IT",
      "Canada": "CA",
      "Australia": "AU",
      "België": "BE",
      "Schweiz": "CH",
      "Österreich": "AT",
      "Sverige": "SE",
      "Norge": "NO",
      "Danmark": "DK",
      "Suomi": "FI",
      "Portugal": "PT",
      "Polska": "PL",
      "Česká republika": "CZ",
      "Magyarország": "HU",
    };

    return countryMap[country] || country;
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
