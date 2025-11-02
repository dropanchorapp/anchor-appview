/**
 * Places API endpoints
 * Handles nearby places search, text search, and category information
 */

import { CategoryService } from "../services/category-service.ts";
import { NominatimService } from "../services/nominatim-service.ts";
import { PlacesNearbyResponse } from "../models/place-models.ts";

export interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

// Create service instance to reuse
const nominatimService = new NominatimService();

/**
 * GET /api/places/nearby - Find nearby places within a radius
 */
export async function getNearbyPlaces(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  const lat = parseFloat(url.searchParams.get("lat") || "0");
  const lng = parseFloat(url.searchParams.get("lng") || "0");
  const radius = Math.min(
    parseFloat(url.searchParams.get("radius") || "300"),
    2000, // max 2km for places search
  );
  const categoriesParam = url.searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",") : [];
  const providerParam = url.searchParams.get("provider") || "overpass";

  // Validate coordinates
  if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return new Response(
      JSON.stringify({
        error:
          "Valid lat and lng parameters required (lat: -90 to 90, lng: -180 to 180)",
      }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    // Get provider instance
    const { PlaceProviderFactory } = await import(
      "../services/places-provider.ts"
    );
    const provider = await PlaceProviderFactory.create(providerParam);

    console.log(`📍 Using places provider: ${provider.name}`);

    // Search for nearby places
    const placesWithDistance = await provider.findNearbyPlacesWithDistance(
      { latitude: lat, longitude: lng },
      radius,
      categories,
    );

    // Map backend PlaceWithDistance to API format (distanceMeters -> distance)
    const apiPlaces = placesWithDistance.map((place) => ({
      ...place,
      distance: place.distanceMeters, // Map distanceMeters to distance for mobile client
      // Remove distanceMeters to avoid confusion
      distanceMeters: undefined,
    }));

    // Format response
    const response: PlacesNearbyResponse = {
      places: apiPlaces,
      radius: radius, // Changed from searchRadius to radius for mobile client
      center: {
        latitude: lat,
        longitude: lng,
      },
      provider: provider.name, // Include provider name in response
    };

    return new Response(JSON.stringify(response), { headers: corsHeaders });
  } catch (error) {
    console.error("Places search error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to search for nearby places",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

/**
 * GET /api/places/categories - Get all place categories for the mobile app
 */
export function getPlaceCategories(corsHeaders: CorsHeaders): Response {
  try {
    // Get all category data for mobile app consumption
    const categories = CategoryService.getAllCategoryObjects();
    const defaultSearchCategories = CategoryService
      .getDefaultSearchCategories();
    const sociallyRelevantCategories = CategoryService
      .getSociallyRelevantCategories();

    const response = {
      categories,
      defaultSearch: defaultSearchCategories,
      sociallyRelevant: sociallyRelevantCategories,
      metadata: {
        totalCategories: categories.length,
        defaultSearchCount: defaultSearchCategories.length,
        sociallyRelevantCount: sociallyRelevantCategories.length,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Error fetching place categories:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch place categories",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

/**
 * GET /api/places/search - Text search for places near a location
 */
export async function searchPlaces(
  url: URL,
  corsHeaders: CorsHeaders,
): Promise<Response> {
  // Parse and validate parameters
  const query = url.searchParams.get("q");
  const lat = parseFloat(url.searchParams.get("lat") || "0");
  const lng = parseFloat(url.searchParams.get("lng") || "0");
  const country = url.searchParams.get("country");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "10"),
    25, // max 25 results
  );

  // Validate required parameters
  if (!query || query.trim() === "") {
    return new Response(
      JSON.stringify({ error: "Query parameter 'q' is required" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  if (!lat || !lng || lat === 0 || lng === 0) {
    return new Response(
      JSON.stringify({
        error: "Valid latitude and longitude parameters are required",
      }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  // Validate coordinate ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(
      JSON.stringify({ error: "Invalid latitude or longitude values" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    console.log(
      `Searching places: "${query}" near ${lat}, ${lng} (country: ${
        country || "any"
      })`,
    );

    // Search for places using Nominatim
    const places = await nominatimService.searchPlaces(
      query.trim(),
      { latitude: lat, longitude: lng },
      {
        country,
        limit,
        radiusKm: 2, // 2km search radius for 4x4km box as requested
      },
    );

    console.log(`Found ${places.length} places for query: "${query}"`);

    // Format response to match the existing places API structure
    const response = {
      places,
      query,
      center: {
        latitude: lat,
        longitude: lng,
      },
      radius: 2000, // 2km in meters
      count: places.length,
    };

    return new Response(JSON.stringify(response), { headers: corsHeaders });
  } catch (error) {
    console.error("Places search error:", error);
    const errorResponse = {
      error: "Failed to search for places",
      details: error instanceof Error ? error.message : "Unknown error",
    };

    // Return appropriate status code based on error type
    const status =
      error instanceof Error && error.message.includes("Rate limit")
        ? 429
        : 500;

    return new Response(JSON.stringify(errorResponse), {
      status,
      headers: corsHeaders,
    });
  }
}
