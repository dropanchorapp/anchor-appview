/**
 * LocationIQ provider wrapper
 * Implements PlaceProvider interface for LocationIQ Nearby API
 */

import type { PlaceProvider } from "./places-provider.ts";
import type { PlaceWithDistance } from "../models/place-models.ts";
import { LocationIQService } from "./locationiq-service.ts";

export class LocationIQProvider implements PlaceProvider {
  readonly name = "locationiq";
  private service: LocationIQService;

  constructor() {
    this.service = new LocationIQService();
  }

  async findNearbyPlacesWithDistance(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number,
    categories: string[],
  ): Promise<PlaceWithDistance[]> {
    const places = await this.service.findNearbyPlaces(
      coordinate,
      radiusMeters,
      categories,
    );

    // Add distance calculation and formatting
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
      };
    });

    // Sort by distance (closest first)
    return placesWithDistance.sort((a, b) =>
      a.distanceMeters - b.distanceMeters
    );
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
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

    return R * c; // Distance in meters
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
