/**
 * Overpass provider wrapper
 * Wraps existing OverpassService to implement PlaceProvider interface
 */

import type { PlaceProvider } from "./places-provider.ts";
import type { PlaceWithDistance } from "../models/place-models.ts";
import { OverpassService } from "./overpass-service.ts";

export class OverpassProvider implements PlaceProvider {
  readonly name = "overpass";
  private service: OverpassService;

  constructor() {
    this.service = new OverpassService();
  }

  async findNearbyPlacesWithDistance(
    coordinate: { latitude: number; longitude: number },
    radiusMeters: number,
    categories: string[],
  ): Promise<PlaceWithDistance[]> {
    return await this.service.findNearbyPlacesWithDistance(
      coordinate,
      radiusMeters,
      categories,
    );
  }
}
