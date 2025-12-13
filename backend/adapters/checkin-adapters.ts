/**
 * Checkin Adapters - Transform records from different AT Protocol lexicons
 * into a unified CheckinData format for display in the Anchor feed.
 *
 * To add a new lexicon:
 * 1. Create a transform function that maps fields to CheckinData
 * 2. Add an entry to CHECKIN_SOURCES array
 */

/**
 * Unified checkin data structure (matches frontend CheckinData)
 */
export interface TransformedCheckin {
  id: string;
  uri: string;
  text: string;
  createdAt: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  address?: {
    name?: string;
    street?: string;
    locality?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  category?: string;
  categoryGroup?: string;
  categoryIcon?: string;
  source?: "anchor" | "beaconbits";
  // Image data (Anchor only)
  imageThumbCid?: string;
  imageFullsizeCid?: string;
  imageAlt?: string;
  // FSQ data (Anchor only)
  fsq?: {
    fsqPlaceId: string;
    name?: string;
    latitude?: string;
    longitude?: string;
  };
}

/**
 * Checkin source configuration
 */
export interface CheckinSource {
  collection: string;
  transform: (
    record: any,
    did: string,
    pdsUrl: string,
  ) => TransformedCheckin | null;
  sourceId?: "anchor" | "beaconbits";
}

/**
 * Transform an Anchor checkin record (app.dropanchor.checkin)
 */
function transformAnchorCheckin(
  record: any,
  _did: string,
  _pdsUrl: string,
): TransformedCheckin | null {
  const value = record.value;
  const rkey = record.uri.split("/").pop();

  // Parse coordinates - handle both old and new format
  let coordinates;
  if (value?.geo) {
    // NEW format: embedded geo object
    const rawGeo = value.geo;
    coordinates = {
      latitude: typeof rawGeo.latitude === "number"
        ? rawGeo.latitude
        : parseFloat(rawGeo.latitude),
      longitude: typeof rawGeo.longitude === "number"
        ? rawGeo.longitude
        : parseFloat(rawGeo.longitude),
    };
  } else if (value?.coordinates) {
    // OLD format: coordinates object
    const rawCoords = value.coordinates;
    coordinates = {
      latitude: typeof rawCoords.latitude === "number"
        ? rawCoords.latitude
        : parseFloat(rawCoords.latitude),
      longitude: typeof rawCoords.longitude === "number"
        ? rawCoords.longitude
        : parseFloat(rawCoords.longitude),
    };
  } else {
    console.warn(
      `Skipping Anchor checkin ${rkey} with missing geo/coordinates`,
    );
    return null;
  }

  // Validate parsed coordinates
  if (isNaN(coordinates.latitude) || isNaN(coordinates.longitude)) {
    console.warn(`Skipping Anchor checkin ${rkey} with invalid coordinates`);
    return null;
  }

  const checkin: TransformedCheckin = {
    id: rkey,
    uri: record.uri,
    text: value.text || "",
    createdAt: value.createdAt,
    coordinates,
    source: "anchor",
  };

  // Add category info if present
  if (value.category) checkin.category = value.category;
  if (value.categoryGroup) checkin.categoryGroup = value.categoryGroup;
  if (value.categoryIcon) checkin.categoryIcon = value.categoryIcon;

  // Get address - handle both old and new format
  if (value.address && typeof value.address === "object") {
    // NEW format: embedded address object
    checkin.address = {
      name: value.address.name,
      street: value.address.street,
      locality: value.address.locality,
      region: value.address.region,
      country: value.address.country,
      postalCode: value.address.postalCode,
    };
  }
  // Note: OLD format with addressRef requires separate fetch - handled in user-checkins.ts

  // Add fsq data if present
  if (value.fsq && typeof value.fsq === "object") {
    checkin.fsq = {
      fsqPlaceId: value.fsq.fsqPlaceId,
      name: value.fsq.name,
      latitude: value.fsq.latitude,
      longitude: value.fsq.longitude,
    };
  }

  // Add image CIDs if present (URLs constructed later with PDS URL)
  if (value.image?.thumb && value.image?.fullsize) {
    checkin.imageThumbCid = value.image.thumb.ref.$link;
    checkin.imageFullsizeCid = value.image.fullsize.ref.$link;
    checkin.imageAlt = value.image.alt;
  }

  return checkin;
}

/**
 * Transform a BeaconBits beacon record (app.beaconbits.beacon)
 */
function transformBeaconBitsCheckin(
  record: any,
  _did: string,
  _pdsUrl: string,
): TransformedCheckin | null {
  const value = record.value;
  const rkey = record.uri.split("/").pop();

  // Skip private beacons
  if (value.visibility && value.visibility !== "public") {
    return null;
  }

  // Parse location
  const lat = parseFloat(value.location?.latitude);
  const lng = parseFloat(value.location?.longitude);
  if (isNaN(lat) || isNaN(lng)) {
    console.warn(`Skipping BeaconBits beacon ${rkey} with invalid location`);
    return null;
  }

  const checkin: TransformedCheckin = {
    id: rkey,
    uri: record.uri,
    text: value.shout || "",
    createdAt: value.createdAt,
    coordinates: { latitude: lat, longitude: lng },
    source: "beaconbits",
  };

  // Add address from addressDetails
  if (value.addressDetails || value.venueName) {
    checkin.address = {
      name: value.venueName || value.addressDetails?.name,
      street: value.addressDetails?.street,
      locality: value.addressDetails?.locality,
      region: value.addressDetails?.region,
      country: value.addressDetails?.country,
      postalCode: value.addressDetails?.postalCode,
    };
  }

  // Add category
  if (value.venueCategory) {
    checkin.category = value.venueCategory;
  }

  return checkin;
}

/**
 * Configured checkin sources to fetch and transform
 */
export const CHECKIN_SOURCES: CheckinSource[] = [
  {
    collection: "app.dropanchor.checkin",
    transform: transformAnchorCheckin,
    sourceId: "anchor",
  },
  {
    collection: "app.beaconbits.beacon",
    transform: transformBeaconBitsCheckin,
    sourceId: "beaconbits",
  },
  // Future: Add more lexicons here
  // {
  //   collection: "app.example.checkin",
  //   transform: transformExampleCheckin,
  //   sourceId: "example",
  // },
];

/**
 * Fetch all records from a collection with pagination
 */
export async function fetchAllRecords(
  pdsUrl: string,
  did: string,
  collection: string,
): Promise<any[]> {
  const allRecords: any[] = [];
  let cursor: string | null = null;

  do {
    let url =
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=${collection}&limit=100&reverse=true`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Collection might not exist for this user - that's OK
        if (response.status === 400) {
          break;
        }
        console.warn(
          `Failed to fetch ${collection} for ${did}: ${response.status}`,
        );
        break;
      }

      const data = await response.json();
      allRecords.push(...(data.records || []));
      cursor = data.cursor || null;
    } catch (error) {
      console.warn(`Error fetching ${collection} for ${did}:`, error);
      break;
    }
  } while (cursor);

  return allRecords;
}
