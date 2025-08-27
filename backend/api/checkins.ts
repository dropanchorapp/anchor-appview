// Checkin creation API endpoint for Anchor
import type { Context } from "https://esm.sh/hono";
import { OverpassService } from "../services/overpass-service.ts";
import type { Place } from "../models/place-models.ts";
import { processCheckinEvent as _processCheckinEvent } from "../ingestion/record-processor.ts";

// Global service instance for address enhancement
const overpassService = new OverpassService();

/**
 * Get enhanced address record with proper validation and fallbacks
 * Uses existing OverpassService logic to prevent name/locality duplication
 */
/**
 * Convert API PlaceInput to proper Place object
 */
function _sanitizePlaceInput(input: PlaceInput): Place {
  const latitude = typeof input.latitude === "string"
    ? parseFloat(input.latitude)
    : input.latitude;
  const longitude = typeof input.longitude === "string"
    ? parseFloat(input.longitude)
    : input.longitude;

  // Create a proper Place object with required fields
  return {
    id: input.id || `unknown:${input.name}`,
    elementType: input.elementType || "node",
    elementId: input.elementId || 0,
    name: input.name,
    latitude,
    longitude,
    tags: input.tags,
    address: input.address || {
      $type: "community.lexicon.location.address",
      name: input.name,
      street: input.tags["addr:street"],
      locality: input.tags["addr:city"] || input.tags["addr:locality"],
      region: input.tags["addr:state"] || input.tags["addr:region"],
      country: input.tags["addr:country"] || input.tags["addr:country_code"],
      postalCode: input.tags["addr:postcode"],
    },
    category: input.category || input.tags["amenity"] || input.tags["shop"] ||
      input.tags["leisure"] || input.tags["tourism"],
    categoryGroup: input.categoryGroup,
    icon: input.icon || "📍",
  };
}

async function _getEnhancedAddressRecord(
  place: Place,
): Promise<CommunityAddressRecord> {
  // Use OverpassService to enhance the address directly
  try {
    console.log(`🔍 Enhancing address for place: ${place.name}`);
    const enhancedAddress = await overpassService.getEnhancedAddress(place);

    // Ensure no name/locality duplication
    if (enhancedAddress.locality === place.name) {
      enhancedAddress.locality = undefined;
    }

    return enhancedAddress;
  } catch (error) {
    console.warn(`Address enhancement failed for ${place.name}:`, error);

    // Fallback to existing address if available, with validation
    const baseAddress = place.address || {
      $type: "community.lexicon.location.address" as const,
      name: place.name,
      street: place.tags["addr:street"],
      locality: place.tags["addr:city"] || place.tags["addr:locality"],
      region: place.tags["addr:state"] || place.tags["addr:region"],
      country: place.tags["addr:country"] || place.tags["addr:country_code"],
      postalCode: place.tags["addr:postcode"],
    };

    // Ensure no name/locality duplication in fallback
    return {
      ...baseAddress,
      name: place.name,
      locality: baseAddress.locality === place.name
        ? undefined
        : baseAddress.locality,
    };
  }
}

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

// API input format - coordinates might be strings
interface PlaceInput {
  name: string;
  latitude: number | string;
  longitude: number | string;
  tags: Record<string, string>;
  // Optional fields that might be missing from API input
  id?: string;
  elementType?: "node" | "way" | "relation";
  elementId?: number;
  address?: any;
  category?: string;
  categoryGroup?: any;
  icon?: string;
}

interface CheckinRequest {
  place: PlaceInput;
  message?: string;
  session_id?: string; // For mobile authentication
}

interface CheckinResponse {
  success: boolean;
  checkinUri?: string;
  addressUri?: string;
  error?: string;
}

// Create a checkin with address using StrongRef architecture
export function createCheckin(c: Context): Response {
  // TODO: Reimplement checkin creation with Iron Session authentication
  return c.json({
    success: false,
    error: "Checkin creation temporarily disabled during OAuth migration",
  }, 503);
}

// TODO: Restore these functions when Iron Session integration is complete
/*
export async function handleCheckinCreation_DISABLED(c: Context): Promise<Response> {
  try {
    console.log("🚀 Starting checkin creation process...");

    const { session } = authResult;
//     if (
//       !body.place || !body.place.name || !body.place.latitude ||
//       !body.place.longitude
//     ) {
//       return c.json({
//         success: false,
//         error:
//           "Invalid request: place with name, latitude, and longitude required",
//       }, 400);
//     }
//
//     const { message } = body;
//
//     // Convert API input to proper Place object and validate coordinates
//     const place = sanitizePlaceInput(body.place);
//     const lat = place.latitude;
//     const lng = place.longitude;
//
//     if (
//       typeof lat !== "number" || typeof lng !== "number" ||
//       isNaN(lat) || isNaN(lng) ||
//       Math.abs(lat) > 90 || Math.abs(lng) > 180
//     ) {
//       return c.json({
//         success: false,
//         error:
//           `Invalid coordinates: lat=${place.latitude}, lng=${place.longitude}. Must be valid numbers within bounds (lat: -90 to 90, lng: -180 to 180)`,
//       }, 400);
//     }
//
//     // Validate place name is not empty string
//     if (!place.name.trim()) {
//       return c.json({
//         success: false,
//         error: "Place name cannot be empty",
//       }, 400);
//     }
//
//     // Validate message length if provided
//     const checkinMessage = message?.trim() || "";
//     if (checkinMessage.length > 1000) { // Reasonable limit for checkin messages
//       return c.json({
//         success: false,
//         error: "Message too long. Maximum 1000 characters allowed.",
//       }, 400);
//     }
//
//     // Get enhanced address using existing OverpassService logic
//     // This prevents name/locality duplication and ensures proper country/region data
//     const addressRecord = await getEnhancedAddressRecord(place);
//
//     // Build coordinates using validated values
//     const coordinates: GeoCoordinates = {
//       latitude: lat,
//       longitude: lng,
//     };
//
//     // Use category information from the sanitized place object
//     const category = place.category;
//     const categoryGroup = place.categoryGroup;
//     const categoryIcon = place.icon;
//
//     console.log(`🔰 Creating checkin for ${place.name} by ${session.handle}`);
//
//     // Step 1: Create address record
//     const addressResponse = await makeDPoPRequest(
//       "POST",
//       `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
//       session,
//       JSON.stringify({
//         repo: session.did,
//         collection: "community.lexicon.location.address",
//         record: addressRecord,
//       }),
//     );
//
//     if (!addressResponse.response.ok) {
//       let error = "Unknown error";
//       try {
//         // Try to read the response body only if it hasn't been consumed
//         if (addressResponse.response.body) {
//           error = await addressResponse.response.text();
//         }
//       } catch (e) {
//         console.warn("Could not read response body:", e);
//         error =
//           `HTTP ${addressResponse.response.status}: ${addressResponse.response.statusText}`;
//       }
//       console.error("Failed to create address record:", error);
//       return c.json({
//         success: false,
//         error: "Failed to create address record",
//       }, 500);
//     }
//
//     const addressResult = await addressResponse.response.json();
//     console.log(`✅ Created address record: ${addressResult.uri}`);
//
//     // Use the potentially updated session from address creation (in case token was refreshed)
//     const updatedSession = addressResponse.session;
//
//     // Step 2: Create checkin record with StrongRef to address
//     const checkinRecord: CheckinRecord = {
//       $type: "app.dropanchor.checkin",
//       text: checkinMessage,
//       createdAt: new Date().toISOString(),
//       addressRef: {
//         uri: addressResult.uri,
//         cid: addressResult.cid,
//       },
//       coordinates,
//       category,
//       categoryGroup,
//       categoryIcon,
//     };
//
//     const checkinResponse = await makeDPoPRequest(
//       "POST",
//       `${updatedSession.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
//       updatedSession,
//       JSON.stringify({
//         repo: updatedSession.did,
//         collection: "app.dropanchor.checkin",
//         record: checkinRecord,
//       }),
//     );
//
//     if (!checkinResponse.response.ok) {
//       // Cleanup: Delete orphaned address record using the most recent session
//       const addressRkey = extractRkey(addressResult.uri);
//       const finalSession = checkinResponse.session; // Use session from checkin response (may have been refreshed again)
//       await makeDPoPRequest(
//         "POST",
//         `${finalSession.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
//         finalSession,
//         JSON.stringify({
//           repo: finalSession.did,
//           collection: "community.lexicon.location.address",
//           rkey: addressRkey,
//         }),
//       ).catch(console.error); // Best effort cleanup
//
//       let error = "Unknown error";
//       try {
//         // Try to read the response body only if it hasn't been consumed
//         if (checkinResponse.response.body) {
//           error = await checkinResponse.response.text();
//         }
//       } catch (e) {
//         console.warn("Could not read response body:", e);
//         error =
//           `HTTP ${checkinResponse.response.status}: ${checkinResponse.response.statusText}`;
//       }
//       console.error("Failed to create checkin record:", error);
//       return c.json({
//         success: false,
//         error: "Failed to create checkin record",
//       }, 500);
//     }
//
//     const checkinResult = await checkinResponse.response.json();
//     console.log(`✅ Created checkin record: ${checkinResult.uri}`);
//
//     // IMMEDIATELY save to local database for instant feed updates
//     try {
//       const rkey = extractRkey(checkinResult.uri);
//       await processCheckinEvent({
//         did: updatedSession.did,
//         time_us: Date.now() * 1000, // Convert to microseconds
//         commit: {
//           rkey: rkey,
//           collection: "app.dropanchor.checkin",
//           operation: "create",
//           record: checkinRecord,
//           cid: checkinResult.cid,
//         },
//       });
//       console.log(`✅ Saved checkin to local database: ${rkey}`);
//     } catch (localSaveError) {
//       console.error(
//         "Failed to save checkin to local database:",
//         localSaveError,
//       );
//       // Don't fail the request - AT Protocol save succeeded, local save can be retried later
//     }
//
//     return c.json({
//       success: true,
//       checkinUri: checkinResult.uri,
//       addressUri: addressResult.uri,
//     });
//   } catch (error) {
//     console.error("Checkin creation error:", error);
//     return c.json({
//       success: false,
//       error: "Internal server error",
//     }, 500);
//   }
// }
//
// // Extract rkey from AT URI (at://did:plc:abc/collection/rkey)
// function extractRkey(uri: string): string {
//   const parts = uri.split("/");
//   return parts[parts.length - 1];
// }
*/
