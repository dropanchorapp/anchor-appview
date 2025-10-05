/**
 * Provider abstraction for place discovery services
 * Allows pluggable backends (Overpass, LocationIQ, etc.)
 */

import type { PlaceWithDistance } from "../models/place-models.ts";

export interface PlaceProvider {
  /**
   * Provider name for identification
   */
  readonly name: string;

  /**
   * Find nearby places with distance calculation
   */
  findNearbyPlacesWithDistance(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number,
    categories: string[],
  ): Promise<PlaceWithDistance[]>;
}

export class PlaceProviderFactory {
  /**
   * Create a provider instance by name
   */
  static async create(providerName: string): Promise<PlaceProvider> {
    switch (providerName.toLowerCase()) {
      case "locationiq": {
        const { LocationIQProvider } = await import("./locationiq-provider.ts");
        return new LocationIQProvider();
      }
      case "overpass":
      default: {
        const { OverpassProvider } = await import("./overpass-provider.ts");
        return new OverpassProvider();
      }
    }
  }

  /**
   * Get list of available provider names
   */
  static getAvailableProviders(): string[] {
    return ["overpass", "locationiq"];
  }
}
