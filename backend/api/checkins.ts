// Checkin creation API endpoint for Anchor
import type { Context } from "jsr:@hono/hono@4.9.6";
import { OverpassService } from "../services/overpass-service.ts";
import type { Place } from "../models/place-models.ts";
import {
  getClearSessionCookie,
  getSessionFromRequest,
  setSessionCookie,
} from "../utils/session.ts";
// No database imports needed - all data read from PDS
import type { OAuthSessionsInterface } from "jsr:@tijs/atproto-oauth@2.3.0";

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

// Helper type for address data (internal use, will be mapped to AddressObject)
interface EnhancedAddressData {
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  country?: string;
  postalCode?: string;
}

async function _getEnhancedAddressRecord(
  place: Place,
): Promise<EnhancedAddressData> {
  // If place already has complete address data (from iOS app), use it directly
  if (
    place.address &&
    place.address.country &&
    place.address.region
  ) {
    console.log(
      `✅ Using complete address data from client for: ${place.name}`,
    );
    // Ensure no name/locality duplication
    return {
      name: place.name,
      street: place.address.street,
      locality: place.address.locality === place.name
        ? undefined
        : place.address.locality,
      region: place.address.region,
      country: place.address.country,
      postalCode: place.address.postalCode,
    };
  }

  // Use OverpassService to enhance the address
  try {
    console.log(`🔍 Enhancing address for place: ${place.name}`);
    const enhancedAddress = await overpassService.getEnhancedAddress(place);

    // Ensure no name/locality duplication
    return {
      name: place.name,
      street: enhancedAddress.street,
      locality: enhancedAddress.locality === place.name
        ? undefined
        : enhancedAddress.locality,
      region: enhancedAddress.region,
      country: enhancedAddress.country,
      postalCode: enhancedAddress.postalCode,
    };
  } catch (error) {
    console.warn(`Address enhancement failed for ${place.name}:`, error);

    // Fallback to OSM tags if available
    return {
      name: place.name,
      street: place.tags["addr:street"],
      locality: place.tags["addr:city"] || place.tags["addr:locality"],
      region: place.tags["addr:state"] || place.tags["addr:region"],
      country: place.tags["addr:country"] || place.tags["addr:country_code"],
      postalCode: place.tags["addr:postcode"],
    };
  }
}

// AT Protocol record types - embedded format (no separate address record)

// Embedded address object (based on community.lexicon.location.address)
// No $type needed for embedded objects - type is known from lexicon context
interface AddressObject {
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country: string; // Required - ISO 3166 country code
}

// Embedded geo object (based on community.lexicon.location.geo)
interface GeoObject {
  latitude: string;
  longitude: string;
  altitude?: string;
  name?: string;
}

// Optional embedded FSQ place object (based on community.lexicon.location.fsq)
interface FsqPlaceObject {
  fsqPlaceId: string;
  name?: string;
  latitude?: string;
  longitude?: string;
}

interface CheckinRecord {
  $type: "app.dropanchor.checkin";
  text: string;
  createdAt: string;
  address: AddressObject; // Embedded, not a ref
  geo: GeoObject; // Renamed from coordinates
  category?: string;
  categoryGroup?: string;
  categoryIcon?: string;
  image?: CheckinImage;
  fsq?: FsqPlaceObject; // Optional Foursquare venue data
}

interface CheckinImage {
  thumb: BlobRef;
  fullsize: BlobRef;
  alt?: string;
}

interface BlobRef {
  $type: "blob";
  ref: { $link: string }; // CID
  mimeType: string;
  size: number;
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

// Create a checkin with address using StrongRef architecture
export async function createCheckin(c: Context): Promise<Response> {
  try {
    // Authenticate user with session refresh support
    const { session: oauthSession, setCookieHeader, error } =
      await getSessionFromRequest(c.req.raw);
    if (!oauthSession) {
      const response = c.json(
        {
          error: "Authentication required",
          message: error?.message || "Please log in again",
          code: error?.type || "SESSION_EXPIRED",
        },
        401,
      );
      response.headers.set("Set-Cookie", getClearSessionCookie());
      return response;
    }

    const did = oauthSession.did;

    // Detect content type and parse accordingly
    const contentType = c.req.header("content-type") || "";
    let body: any;
    let imageFile: File | null = null;
    let imageAlt: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      // Parse multipart form data
      const formData = await c.req.formData();

      // Get place data (sent as JSON string in multipart)
      const placeData = formData.get("place");
      if (typeof placeData === "string") {
        body = { place: JSON.parse(placeData) };
      } else {
        return c.json({
          success: false,
          error: "Invalid place data in form",
        }, 400);
      }

      // Get message
      const messageData = formData.get("message");
      if (messageData && typeof messageData === "string") {
        body.message = messageData;
      }

      // Get image if present
      const imageData = formData.get("image");
      if (imageData && imageData instanceof File) {
        imageFile = imageData;
      }

      // Get image alt text
      const altData = formData.get("imageAlt");
      if (altData && typeof altData === "string") {
        imageAlt = altData;
      }
    } else {
      // Parse JSON body (backward compatible)
      body = await c.req.json();
    }

    // Validate required fields
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

    const { message } = body;

    // Convert API input to proper Place object and validate coordinates
    const place = _sanitizePlaceInput(body.place);
    const lat = place.latitude;
    const lng = place.longitude;

    if (
      typeof lat !== "number" || typeof lng !== "number" ||
      isNaN(lat) || isNaN(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      return c.json({
        success: false,
        error: "Invalid coordinates",
      }, 400);
    }

    console.log("🚀 Starting checkin creation process...");

    // Process image if present
    let processedImage: {
      thumb: Uint8Array;
      thumbMimeType: string;
      fullsize: Uint8Array;
      fullsizeMimeType: string;
    } | null = null;

    if (imageFile) {
      try {
        const { validateAndProcessImage } = await import(
          "../services/image-service.ts"
        );

        const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
        processedImage = validateAndProcessImage(imageBytes);
        console.log(
          `✅ Image processed: thumb ${processedImage.thumb.length} bytes, fullsize ${processedImage.fullsize.length} bytes`,
        );
      } catch (imageError) {
        return c.json({
          success: false,
          error: `Image processing failed: ${imageError.message}`,
        }, 400);
      }
    }

    // Get sessions instance for clean OAuth API access
    const { sessions } = await import("../routes/oauth.ts");

    // Create checkin record with embedded address via AT Protocol
    const createResult = await createCheckinWithEmbeddedAddress(
      sessions,
      did,
      place,
      message || "",
      processedImage,
      imageAlt,
    );

    if (!createResult.success) {
      return c.json({
        success: false,
        error: createResult.error,
      }, 500);
    }

    console.log("✅ Checkin created successfully");

    // Create shareable ID using simple rkey format for clean URLs
    const rkey = createResult.checkinUri!.split("/").pop();
    const shareableId = rkey;

    return setSessionCookie(
      c.json({
        success: true,
        checkinUri: createResult.checkinUri,
        shareableId: shareableId,
        shareableUrl: `https://dropanchor.app/checkin/${shareableId}`,
        imageUploaded: !!processedImage,
      }),
      setCookieHeader,
    );
  } catch (err) {
    console.error("❌ Checkin creation failed:", err);
    return c.json({
      success: false,
      error: "Internal server error",
    }, 500);
  }
}

// Helper function to extract rkey from AT Protocol URI
function extractRkey(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

// OAuth session methods now handle all authentication, DPoP, and token refresh automatically

// Create checkin record with embedded address via AT Protocol using OAuth sessions
async function createCheckinWithEmbeddedAddress(
  sessions: OAuthSessionsInterface,
  did: string,
  place: Place,
  message: string,
  processedImage?: {
    thumb: Uint8Array;
    thumbMimeType: string;
    fullsize: Uint8Array;
    fullsizeMimeType: string;
  } | null,
  imageAlt?: string,
): Promise<
  { success: boolean; checkinUri?: string; error?: string }
> {
  try {
    console.log(`🔰 Getting OAuth session for DID: ${did}`);

    // Use the OAuth sessions API to get a ready-to-use session with automatic token refresh
    const oauthSession = await sessions.getOAuthSession(did);
    if (!oauthSession) {
      console.error(`❌ Failed to get OAuth session for DID: ${did}`);
      console.error("This usually means:");
      console.error(
        "1. User needs to re-authenticate (sign out and sign back in)",
      );
      console.error("2. OAuth session expired and needs refresh");
      console.error("3. Mobile OAuth flow didn't complete properly");
      return {
        success: false,
        error:
          "OAuth session not found. Please sign out and sign back in to refresh your authentication.",
      };
    }

    console.log(`✅ Got OAuth session for ${oauthSession.handle || did}`);
    console.log(
      "✅ Session includes automatic token refresh and DPoP handling",
    );

    // Get enhanced address using existing OverpassService logic
    const enhancedAddress = await _getEnhancedAddressRecord(place);

    // Build embedded address object (country is required)
    const address: AddressObject = {
      name: enhancedAddress.name,
      street: enhancedAddress.street,
      locality: enhancedAddress.locality,
      region: enhancedAddress.region,
      postalCode: enhancedAddress.postalCode,
      country: enhancedAddress.country || "XX", // Fallback to XX if no country
    };

    // Build embedded geo object - convert to strings for DAG-CBOR compliance
    const geo: GeoObject = {
      latitude: place.latitude.toString(),
      longitude: place.longitude.toString(),
    };

    // Use category information from the sanitized place object
    const category = place.category;
    const categoryGroup = place.categoryGroup;
    const categoryIcon = place.icon;

    console.log(
      `🔰 Creating checkin for ${place.name} by ${oauthSession.handle || did}`,
    );

    // Step 2: Upload image blobs if present
    let imageData: CheckinImage | undefined;

    if (processedImage) {
      try {
        console.log("📸 Uploading image blobs to PDS...");

        // Upload thumbnail - copy to new ArrayBuffer for type safety
        const thumbBuffer = new ArrayBuffer(processedImage.thumb.byteLength);
        const thumbView = new Uint8Array(thumbBuffer);
        thumbView.set(processedImage.thumb);
        const thumbBlob = new Blob([thumbBuffer], {
          type: processedImage.thumbMimeType,
        });
        const thumbResponse = await oauthSession.makeRequest(
          "POST",
          `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
          {
            headers: {
              "Content-Type": processedImage.thumbMimeType,
            },
            body: thumbBlob,
          },
        );

        if (!thumbResponse.ok) {
          throw new Error("Failed to upload thumbnail");
        }

        const thumbResult = await thumbResponse.json();

        // Upload fullsize - copy to new ArrayBuffer for type safety
        const fullsizeBuffer = new ArrayBuffer(
          processedImage.fullsize.byteLength,
        );
        const fullsizeView = new Uint8Array(fullsizeBuffer);
        fullsizeView.set(processedImage.fullsize);
        const fullsizeBlob = new Blob([fullsizeBuffer], {
          type: processedImage.fullsizeMimeType,
        });
        const fullsizeResponse = await oauthSession.makeRequest(
          "POST",
          `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
          {
            headers: {
              "Content-Type": processedImage.fullsizeMimeType,
            },
            body: fullsizeBlob,
          },
        );

        if (!fullsizeResponse.ok) {
          throw new Error("Failed to upload fullsize image");
        }

        const fullsizeResult = await fullsizeResponse.json();

        // Create image data structure
        imageData = {
          thumb: {
            $type: "blob",
            ref: { $link: thumbResult.blob.ref.$link },
            mimeType: thumbResult.blob.mimeType,
            size: thumbResult.blob.size,
          },
          fullsize: {
            $type: "blob",
            ref: { $link: fullsizeResult.blob.ref.$link },
            mimeType: fullsizeResult.blob.mimeType,
            size: fullsizeResult.blob.size,
          },
        };

        if (imageAlt) {
          imageData.alt = imageAlt;
        }

        console.log(`✅ Image blobs uploaded successfully`);
      } catch (imageError) {
        console.error("❌ Failed to upload image blobs:", imageError);
        // Don't fail the checkin, just skip the image
        imageData = undefined;
      }
    }

    // Step 2: Create checkin record with embedded address and geo
    const checkinRecord: CheckinRecord = {
      $type: "app.dropanchor.checkin",
      text: message,
      createdAt: new Date().toISOString(),
      address,
      geo,
      category,
      categoryGroup,
      categoryIcon,
    };

    // Add image if successfully uploaded
    if (imageData) {
      checkinRecord.image = imageData;
    }

    const checkinResponse = await oauthSession.makeRequest(
      "POST",
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: oauthSession.did,
          collection: "app.dropanchor.checkin",
          record: checkinRecord,
        }),
      },
    );

    if (!checkinResponse.ok) {
      const error = await checkinResponse.text();
      console.error("Failed to create checkin record:", error);
      return {
        success: false,
        error: "Failed to create checkin record",
      };
    }

    const checkinResult = await checkinResponse.json();
    console.log(`✅ Created checkin record: ${checkinResult.uri}`);

    return {
      success: true,
      checkinUri: checkinResult.uri,
    };
  } catch (err) {
    console.error("❌ Create checkin failed:", err);
    return {
      success: false,
      error: "Internal server error",
    };
  }
}

// Delete a checkin record (address is now embedded, no separate record to delete)
export async function deleteCheckin(c: Context): Promise<Response> {
  try {
    // Authenticate user with session refresh support
    const { session: oauthSession, setCookieHeader, error } =
      await getSessionFromRequest(c.req.raw);
    if (!oauthSession) {
      const response = c.json(
        {
          error: "Authentication required",
          message: error?.message || "Please log in again",
          code: error?.type || "SESSION_EXPIRED",
        },
        401,
      );
      response.headers.set("Set-Cookie", getClearSessionCookie());
      return response;
    }

    const did = oauthSession.did;

    // Get checkin DID and rkey from URL params
    const targetDid = c.req.param("did");
    const rkey = c.req.param("rkey");

    if (!targetDid || !rkey) {
      return c.json({
        success: false,
        error: "Missing required parameters: did and rkey",
      }, 400);
    }

    // Verify that the authenticated user owns the checkin
    if (did !== targetDid) {
      return c.json({
        success: false,
        error: "Forbidden: Can only delete your own checkins",
      }, 403);
    }

    console.log(`🗑️ Starting checkin deletion: ${targetDid}/${rkey}`);

    // Get sessions instance for clean OAuth API access
    const { sessions } = await import("../routes/oauth.ts");

    // Delete checkin record via AT Protocol
    const deleteResult = await deleteCheckinRecord(
      sessions,
      did,
      rkey,
    );

    if (!deleteResult.success) {
      return c.json({
        success: false,
        error: deleteResult.error,
      }, 500);
    }

    console.log("✅ Checkin deleted successfully");

    return setSessionCookie(
      c.json({
        success: true,
      }),
      setCookieHeader,
    );
  } catch (err) {
    console.error("❌ Checkin deletion failed:", err);
    return c.json({
      success: false,
      error: "Internal server error",
    }, 500);
  }
}

// Delete checkin record via AT Protocol using OAuth sessions
async function deleteCheckinRecord(
  sessions: OAuthSessionsInterface,
  did: string,
  checkinRkey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🔰 Getting OAuth session for DID: ${did}`);

    // Use the OAuth sessions API to get a ready-to-use session with automatic token refresh
    const oauthSession = await sessions.getOAuthSession(did);
    if (!oauthSession) {
      console.error("Failed to get OAuth session for DID:", did);
      return {
        success: false,
        error: "Failed to get OAuth session",
      };
    }

    console.log(`✅ Got OAuth session for ${oauthSession.handle || did}`);

    // Fetch the checkin record to get image references for cleanup
    console.log(`🔰 Fetching checkin record for image cleanup`);
    const checkinUri = `at://${did}/app.dropanchor.checkin/${checkinRkey}`;

    const getRecordResponse = await oauthSession.makeRequest(
      "GET",
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.dropanchor.checkin&rkey=${checkinRkey}`,
    );

    if (!getRecordResponse.ok) {
      const error = await getRecordResponse.text();
      console.error("Failed to fetch checkin record:", error);
      return {
        success: false,
        error: "Failed to fetch checkin record",
      };
    }

    const checkinData = await getRecordResponse.json();
    const imageData = checkinData.value?.image;

    // Step 1: Delete image blobs if they exist
    if (imageData?.thumb?.ref?.$link || imageData?.fullsize?.ref?.$link) {
      console.log(`🗑️ Deleting image blobs`);

      // Delete thumbnail blob
      if (imageData.thumb?.ref?.$link) {
        try {
          const thumbCid = imageData.thumb.ref.$link;
          const deleteThumbResponse = await oauthSession.makeRequest(
            "POST",
            `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.deleteBlob`,
            {
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                did: did,
                cid: thumbCid,
              }),
            },
          );

          if (!deleteThumbResponse.ok) {
            const error = await deleteThumbResponse.text();
            console.warn("Failed to delete thumbnail blob (non-fatal):", error);
          } else {
            console.log(`✅ Deleted thumbnail blob: ${thumbCid}`);
          }
        } catch (err) {
          console.warn("Failed to delete thumbnail blob:", err);
        }
      }

      // Delete fullsize blob
      if (imageData.fullsize?.ref?.$link) {
        try {
          const fullsizeCid = imageData.fullsize.ref.$link;
          const deleteFullsizeResponse = await oauthSession.makeRequest(
            "POST",
            `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.deleteBlob`,
            {
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                did: did,
                cid: fullsizeCid,
              }),
            },
          );

          if (!deleteFullsizeResponse.ok) {
            const error = await deleteFullsizeResponse.text();
            console.warn(
              "Failed to delete fullsize blob (non-fatal):",
              error,
            );
          } else {
            console.log(`✅ Deleted fullsize blob: ${fullsizeCid}`);
          }
        } catch (err) {
          console.warn("Failed to delete fullsize blob:", err);
        }
      }
    }

    // Step 2: Delete the checkin record
    console.log(`🗑️ Deleting checkin record: ${checkinUri}`);
    const deleteCheckinResponse = await oauthSession.makeRequest(
      "POST",
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: did,
          collection: "app.dropanchor.checkin",
          rkey: checkinRkey,
        }),
      },
    );

    if (!deleteCheckinResponse.ok) {
      const error = await deleteCheckinResponse.text();
      console.error("Failed to delete checkin record:", error);
      return {
        success: false,
        error: "Failed to delete checkin record",
      };
    }

    console.log(`✅ Deleted checkin record: ${checkinUri}`);

    return {
      success: true,
    };
  } catch (err) {
    console.error("❌ Delete checkin failed:", err);
    return {
      success: false,
      error: "Internal server error",
    };
  }
}

// All checkin data now read directly from PDS - no local fallback needed
