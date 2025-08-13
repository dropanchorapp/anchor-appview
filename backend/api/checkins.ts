// Checkin creation API endpoint for Anchor
import type { Context } from "https://esm.sh/hono";
import { makeDPoPRequest } from "../oauth/dpop.ts";
import { getSessionBySessionId } from "../oauth/session.ts";

// AT Protocol record types
interface CommunityAddressRecord {
  $type: "community.lexicon.location.address";
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  country?: string;
  postalCode?: string;
}

interface CheckinRecord {
  $type: "app.dropanchor.checkin";
  text: string;
  createdAt: string;
  addressRef: StrongRef;
  coordinates: GeoCoordinates;
  category?: string;
  categoryGroup?: string;
  categoryIcon?: string;
}

interface StrongRef {
  uri: string;
  cid: string;
}

interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

interface Place {
  name: string;
  latitude: number | string; // Allow strings for parsing
  longitude: number | string; // Allow strings for parsing
  tags: Record<string, string>;
}

interface CheckinRequest {
  place: Place;
  message?: string;
}

interface CheckinResponse {
  success: boolean;
  checkinUri?: string;
  addressUri?: string;
  error?: string;
}

// Create a checkin with address using StrongRef architecture
export async function createCheckin(c: Context): Promise<Response> {
  try {
    // Get session from cookie
    const sessionCookie = c.req.header("Cookie")?.match(
      /anchor_session=([^;]+)/,
    )?.[1];
    if (!sessionCookie) {
      return c.json({ success: false, error: "Authentication required" }, 401);
    }

    const session = await getSessionBySessionId(sessionCookie);
    if (!session) {
      return c.json({ success: false, error: "Invalid session" }, 401);
    }

    // Parse request body
    const body: CheckinRequest = await c.req.json();
    if (
      !body.place || !body.place.name || !body.place.latitude ||
      !body.place.longitude
    ) {
      return c.json({
        success: false,
        error:
          "Invalid request: place with name, latitude, and longitude required",
      }, 400);
    }

    const { place, message } = body;

    // Validate coordinates are numbers and within valid bounds
    const lat = typeof place.latitude === "number"
      ? place.latitude
      : parseFloat(String(place.latitude));
    const lng = typeof place.longitude === "number"
      ? place.longitude
      : parseFloat(String(place.longitude));

    if (
      typeof lat !== "number" || typeof lng !== "number" ||
      isNaN(lat) || isNaN(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      return c.json({
        success: false,
        error:
          `Invalid coordinates: lat=${place.latitude}, lng=${place.longitude}. Must be valid numbers within bounds (lat: -90 to 90, lng: -180 to 180)`,
      }, 400);
    }

    // Validate place name is not empty string
    if (!place.name.trim()) {
      return c.json({
        success: false,
        error: "Place name cannot be empty",
      }, 400);
    }

    // Validate message length if provided
    const checkinMessage = message?.trim() || "";
    if (checkinMessage.length > 1000) { // Reasonable limit for checkin messages
      return c.json({
        success: false,
        error: "Message too long. Maximum 1000 characters allowed.",
      }, 400);
    }

    // Build address record from place data
    const addressRecord: CommunityAddressRecord = {
      $type: "community.lexicon.location.address",
      name: place.name,
      street: undefined, // OSM places don't always have structured street data
      locality: place.tags?.["addr:city"] ?? place.tags?.["place"] ??
        place.tags?.["name"],
      region: place.tags?.["addr:state"] ?? place.tags?.["addr:region"],
      country: place.tags?.["addr:country"],
      postalCode: place.tags?.["addr:postcode"],
    };

    // Build coordinates using validated values
    const coordinates: GeoCoordinates = {
      latitude: lat,
      longitude: lng,
    };

    // Extract place category information
    const category = extractCategory(place.tags);
    const categoryGroup = extractCategoryGroup(place.tags);
    const categoryIcon = extractCategoryIcon(place.tags);

    console.log(`🔰 Creating checkin for ${place.name} by ${session.handle}`);

    // Step 1: Create address record
    const addressResponse = await makeDPoPRequest(
      "POST",
      `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      session,
      JSON.stringify({
        repo: session.did,
        collection: "community.lexicon.location.address",
        record: addressRecord,
      }),
    );

    if (!addressResponse.response.ok) {
      let error = "Unknown error";
      try {
        // Try to read the response body only if it hasn't been consumed
        if (addressResponse.response.body) {
          error = await addressResponse.response.text();
        }
      } catch (e) {
        console.warn("Could not read response body:", e);
        error =
          `HTTP ${addressResponse.response.status}: ${addressResponse.response.statusText}`;
      }
      console.error("Failed to create address record:", error);
      return c.json({
        success: false,
        error: "Failed to create address record",
      }, 500);
    }

    const addressResult = await addressResponse.response.json();
    console.log(`✅ Created address record: ${addressResult.uri}`);

    // Use the potentially updated session from address creation (in case token was refreshed)
    const updatedSession = addressResponse.session;

    // Step 2: Create checkin record with StrongRef to address
    const checkinRecord: CheckinRecord = {
      $type: "app.dropanchor.checkin",
      text: checkinMessage,
      createdAt: new Date().toISOString(),
      addressRef: {
        uri: addressResult.uri,
        cid: addressResult.cid,
      },
      coordinates,
      category,
      categoryGroup,
      categoryIcon,
    };

    const checkinResponse = await makeDPoPRequest(
      "POST",
      `${updatedSession.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      updatedSession,
      JSON.stringify({
        repo: updatedSession.did,
        collection: "app.dropanchor.checkin",
        record: checkinRecord,
      }),
    );

    if (!checkinResponse.response.ok) {
      // Cleanup: Delete orphaned address record using the most recent session
      const addressRkey = extractRkey(addressResult.uri);
      const finalSession = checkinResponse.session; // Use session from checkin response (may have been refreshed again)
      await makeDPoPRequest(
        "POST",
        `${finalSession.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
        finalSession,
        JSON.stringify({
          repo: finalSession.did,
          collection: "community.lexicon.location.address",
          rkey: addressRkey,
        }),
      ).catch(console.error); // Best effort cleanup

      let error = "Unknown error";
      try {
        // Try to read the response body only if it hasn't been consumed
        if (checkinResponse.response.body) {
          error = await checkinResponse.response.text();
        }
      } catch (e) {
        console.warn("Could not read response body:", e);
        error =
          `HTTP ${checkinResponse.response.status}: ${checkinResponse.response.statusText}`;
      }
      console.error("Failed to create checkin record:", error);
      return c.json({
        success: false,
        error: "Failed to create checkin record",
      }, 500);
    }

    const checkinResult = await checkinResponse.response.json();
    console.log(`✅ Created checkin record: ${checkinResult.uri}`);

    return c.json({
      success: true,
      checkinUri: checkinResult.uri,
      addressUri: addressResult.uri,
    });
  } catch (error) {
    console.error("Checkin creation error:", error);
    return c.json({
      success: false,
      error: "Internal server error",
    }, 500);
  }
}

// Helper functions for category extraction (ported from AnchorKit)
function extractCategory(
  tags: Record<string, string> = {},
): string | undefined {
  return tags["amenity"] ?? tags["shop"] ?? tags["leisure"] ?? tags["tourism"];
}

function extractCategoryGroup(
  tags: Record<string, string> = {},
): string | undefined {
  const amenityGroup = extractAmenityCategoryGroup(tags);
  if (amenityGroup) return amenityGroup;

  const shopGroup = extractShopCategoryGroup(tags);
  if (shopGroup) return shopGroup;

  const leisureGroup = extractLeisureCategoryGroup(tags);
  if (leisureGroup) return leisureGroup;

  return undefined;
}

function extractAmenityCategoryGroup(
  tags: Record<string, string>,
): string | undefined {
  const amenity = tags["amenity"];
  if (!amenity) return undefined;

  switch (amenity) {
    case "restaurant":
    case "cafe":
    case "bar":
    case "pub":
    case "fast_food":
      return "Food & Drink";
    case "climbing_gym":
    case "fitness_centre":
    case "gym":
      return "Sports & Fitness";
    case "hotel":
    case "hostel":
    case "guest_house":
      return "Accommodation";
    default:
      return "Services";
  }
}

function extractShopCategoryGroup(
  tags: Record<string, string>,
): string | undefined {
  return tags["shop"] ? "Shopping" : undefined;
}

function extractLeisureCategoryGroup(
  tags: Record<string, string>,
): string | undefined {
  const leisure = tags["leisure"];
  if (!leisure) return undefined;

  switch (leisure) {
    case "climbing":
    case "fitness_centre":
    case "sports_centre":
      return "Sports & Fitness";
    case "park":
    case "garden":
      return "Outdoors";
    default:
      return "Recreation";
  }
}

function extractCategoryIcon(
  tags: Record<string, string> = {},
): string | undefined {
  const amenityIcon = extractAmenityCategoryIcon(tags);
  if (amenityIcon) return amenityIcon;

  const shopIcon = extractShopCategoryIcon(tags);
  if (shopIcon) return shopIcon;

  const leisureIcon = extractLeisureCategoryIcon(tags);
  if (leisureIcon) return leisureIcon;

  return undefined;
}

function extractAmenityCategoryIcon(
  tags: Record<string, string>,
): string | undefined {
  const amenity = tags["amenity"];
  if (!amenity) return undefined;

  switch (amenity) {
    case "restaurant":
      return "🍽️";
    case "cafe":
      return "☕";
    case "bar":
    case "pub":
      return "🍺";
    case "fast_food":
      return "🍔";
    case "climbing_gym":
      return "🧗‍♂️";
    case "fitness_centre":
    case "gym":
      return "💪";
    case "hotel":
    case "hostel":
    case "guest_house":
      return "🏨";
    default:
      return undefined;
  }
}

function extractShopCategoryIcon(
  tags: Record<string, string>,
): string | undefined {
  return tags["shop"] ? "🏪" : undefined;
}

function extractLeisureCategoryIcon(
  tags: Record<string, string>,
): string | undefined {
  const leisure = tags["leisure"];
  if (!leisure) return undefined;

  switch (leisure) {
    case "climbing":
      return "🧗‍♂️";
    case "fitness_centre":
    case "sports_centre":
      return "💪";
    case "park":
    case "garden":
      return "🌳";
    default:
      return "🎯";
  }
}

// Extract rkey from AT URI (at://did:plc:abc/collection/rkey)
function extractRkey(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}
