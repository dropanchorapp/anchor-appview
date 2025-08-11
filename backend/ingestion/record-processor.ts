// Record processor for checkin events from PDS crawler
// Handles both Jetstream events and direct PDS records
import { db } from "../database/db.ts";
import { checkinsTable } from "../database/schema.ts";
import {
  ATProtocolProfileResolver,
  BlueskyProfileFetcher,
} from "../utils/profile-resolver.ts";
import { DrizzleStorageProvider } from "../utils/storage-provider.ts";

export interface CheckinEvent {
  did: string;
  time_us: number;
  commit: {
    rkey: string;
    collection: string;
    operation: "create" | "update" | "delete";
    record?: any;
    cid: string;
  };
}

// Initialize profile resolver with Drizzle storage
const profileResolver = new ATProtocolProfileResolver(
  new DrizzleStorageProvider(db), // Use Drizzle db instance
  new BlueskyProfileFetcher(),
);

export async function processCheckinEvent(event: CheckinEvent): Promise<void> {
  if (event.commit.collection !== "app.dropanchor.checkin") {
    return;
  }

  if (event.commit.operation !== "create") {
    console.log(`Skipping ${event.commit.operation} operation for checkin`);
    return;
  }

  if (!event.commit.record) {
    console.error("No record data in checkin event");
    return;
  }

  const record = event.commit.record;
  const rkey = event.commit.rkey;

  console.log(`📍 Processing checkin from ${event.did}: ${rkey}`);

  try {
    // Resolve user profile
    const profile = await profileResolver.resolveProfile(event.did);
    const handle = profile?.handle || event.did;
    const displayName = profile?.displayName || handle;
    const avatar = profile?.avatar;

    // Extract and parse coordinates
    const rawLat = record.coordinates?.latitude;
    const rawLng = record.coordinates?.longitude;

    // Parse coordinates to numbers (handle both string and number inputs)
    const lat = typeof rawLat === "string" ? parseFloat(rawLat) : rawLat;
    const lng = typeof rawLng === "string" ? parseFloat(rawLng) : rawLng;

    // Debug logging for coordinate validation
    console.log(
      `🔍 Coordinate debug for ${rkey}: lat=${lat} (${typeof lat}), lng=${lng} (${typeof lng}) [raw: ${rawLat}, ${rawLng}]`,
    );

    if (
      typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) ||
      isNaN(lng)
    ) {
      console.log(
        `⚠️ Skipping checkin ${rkey}: missing coordinates (lat=${lat}, lng=${lng})`,
      );
      return;
    }

    // Additional bounds validation
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      console.error(
        `Coordinates out of bounds for checkin ${rkey}: lat=${lat}, lng=${lng}`,
      );
      return;
    }

    // Extract address information from addressRef if available
    let placeName = "Unknown Location";
    let addressData = null;

    if (record.addressRef?.uri) {
      try {
        addressData = await resolveAddressRecord(
          record.addressRef.uri,
          event.did,
        );
        if (addressData?.name) {
          placeName = addressData.name;
        }
      } catch (error) {
        console.error(
          `Failed to resolve address ${record.addressRef.uri}:`,
          error,
        );
      }
    }

    // Store checkin in database using Drizzle ORM
    const now = new Date().toISOString();
    await db.insert(checkinsTable)
      .values({
        id: rkey,
        uri: `at://${event.did}/app.dropanchor.checkin/${rkey}`,
        rkey: rkey,
        did: event.did,
        handle: handle,
        displayName: displayName,
        avatar: avatar,
        text: record.text || "",
        latitude: lat,
        longitude: lng,
        venueName: placeName,
        addressStreet: addressData?.street || null,
        addressLocality: addressData?.locality || null,
        addressRegion: addressData?.region || null,
        addressCountry: addressData?.country || null,
        addressPostalCode: addressData?.postalCode || null,
        category: record.category || null,
        categoryGroup: record.categoryGroup || null,
        categoryIcon: record.categoryIcon || null,
        createdAt: record.createdAt || now,
        indexedAt: now,
      })
      .onConflictDoUpdate({
        target: checkinsTable.id,
        set: {
          text: record.text || "",
          latitude: lat,
          longitude: lng,
          venueName: placeName,
          addressStreet: addressData?.street || null,
          addressLocality: addressData?.locality || null,
          addressRegion: addressData?.region || null,
          addressCountry: addressData?.country || null,
          addressPostalCode: addressData?.postalCode || null,
          category: record.category || null,
          categoryGroup: record.categoryGroup || null,
          categoryIcon: record.categoryIcon || null,
          handle: handle,
          displayName: displayName,
          avatar: avatar,
          indexedAt: now,
        },
      });

    console.log(`✅ Stored checkin: ${displayName} at ${placeName}`);
  } catch (error) {
    console.error(`❌ Error processing checkin ${rkey}:`, error);
    throw error;
  }
}

// Resolve address record from AT Protocol URI
async function resolveAddressRecord(
  addressUri: string,
  userDid: string,
): Promise<any> {
  try {
    // Extract PDS from user's DID document (simplified - could cache this)
    const didResponse = await fetch(`https://plc.directory/${userDid}`);
    if (!didResponse.ok) {
      throw new Error(`Failed to resolve DID: ${didResponse.status}`);
    }

    const didDoc = await didResponse.json();
    const pdsEndpoint = didDoc.service?.find((s: any) =>
      s.id.endsWith("#atproto_pds") && s.type === "AtprotoPersonalDataServer"
    )?.serviceEndpoint;

    if (!pdsEndpoint) {
      throw new Error("No PDS endpoint found in DID document");
    }

    // Parse AT Protocol URI: at://did:plc:xyz/collection/rkey
    const uriParts = addressUri.replace("at://", "").split("/");
    const [did, collection, rkey] = uriParts;

    // Query the PDS for the address record
    const recordUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.getRecord` +
      `?repo=${did}&collection=${collection}&rkey=${rkey}`;

    const recordResponse = await fetch(recordUrl);
    if (!recordResponse.ok) {
      throw new Error(
        `Failed to fetch address record: ${recordResponse.status}`,
      );
    }

    const recordData = await recordResponse.json();
    return recordData.value;
  } catch (error) {
    console.error(`Error resolving address record ${addressUri}:`, error);
    return null;
  }
}
