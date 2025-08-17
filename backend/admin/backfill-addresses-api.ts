/**
 * API endpoint version of the address backfill tool
 * Extracts the core backfill logic for use in HTTP endpoints
 */

import { db } from "../database/db.ts";
import { checkinsTable } from "../database/schema.ts";
import { and, eq, isNotNull, isNull, or } from "https://esm.sh/drizzle-orm";

interface BackfillStats {
  total: number;
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
}

interface CheckinRecord {
  text?: string;
  category?: string;
  categoryGroup?: string;
  categoryIcon?: string;
  createdAt: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  addressRef?: {
    uri: string;
    cid: string;
  };
}

interface CommunityAddressRecord {
  $type: "community.lexicon.location.address";
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  country?: string;
  postalCode?: string;
}

/**
 * Resolve address record from AT Protocol URI
 */
async function resolveAddressRecord(
  addressUri: string,
  userDid: string,
): Promise<CommunityAddressRecord | null> {
  try {
    // Extract PDS from user's DID document
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
    return recordData.value as CommunityAddressRecord;
  } catch (error) {
    console.error(`Error resolving address record ${addressUri}:`, error);
    return null;
  }
}

/**
 * Fetch original AT Protocol checkin record to get StrongRef
 */
async function fetchCheckinRecord(uri: string): Promise<CheckinRecord | null> {
  try {
    // Parse URI: at://did:plc:xyz/app.dropanchor.checkin/rkey
    const uriParts = uri.replace("at://", "").split("/");
    const [did, collection, rkey] = uriParts;

    // Get PDS endpoint using Slingshot
    const { resolveDIDToPDS } = await import("../oauth/slingshot-resolver.ts");
    const pdsEndpoint = await resolveDIDToPDS(did);

    // Fetch the checkin record
    const recordUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.getRecord` +
      `?repo=${did}&collection=${collection}&rkey=${rkey}`;

    const recordResponse = await fetch(recordUrl);
    if (!recordResponse.ok) {
      throw new Error(
        `Failed to fetch checkin record: ${recordResponse.status}`,
      );
    }

    const recordData = await recordResponse.json();
    return recordData.value as CheckinRecord;
  } catch (error) {
    console.error(`Error fetching checkin record ${uri}:`, error);
    return null;
  }
}

/**
 * Find checkins that need address backfill
 */
async function findCheckinsNeedingBackfill(limit?: number) {
  const baseQuery = db
    .select({
      id: checkinsTable.id,
      uri: checkinsTable.uri,
      did: checkinsTable.did,
      venueName: checkinsTable.venueName,
      latitude: checkinsTable.latitude,
      longitude: checkinsTable.longitude,
      addressStreet: checkinsTable.addressStreet,
      addressLocality: checkinsTable.addressLocality,
      addressRegion: checkinsTable.addressRegion,
      addressCountry: checkinsTable.addressCountry,
      addressPostalCode: checkinsTable.addressPostalCode,
    })
    .from(checkinsTable)
    .where(
      and(
        // Has coordinates (so it's a real checkin)
        isNotNull(checkinsTable.latitude),
        isNotNull(checkinsTable.longitude),
        // Missing most address components (indicating incomplete resolution)
        or(
          isNull(checkinsTable.addressStreet),
          isNull(checkinsTable.addressLocality),
          isNull(checkinsTable.addressRegion),
        ),
      ),
    )
    .orderBy(checkinsTable.indexedAt);

  return await (limit ? baseQuery.limit(limit) : baseQuery);
}

/**
 * Process a single checkin for address backfill
 */
async function processCheckin(
  checkin: any,
  stats: BackfillStats,
  isDryRun: boolean,
) {
  stats.total++;

  try {
    // Fetch the original AT Protocol record
    const record = await fetchCheckinRecord(checkin.uri);
    if (!record) {
      stats.errors++;
      return { success: false, reason: "Could not fetch AT Protocol record" };
    }

    // Check if it has a StrongRef
    if (!record.addressRef?.uri) {
      stats.skipped++;
      return { success: false, reason: "No StrongRef found" };
    }

    // Resolve the address record
    const addressData = await resolveAddressRecord(
      record.addressRef.uri,
      checkin.did,
    );
    if (!addressData) {
      stats.errors++;
      return { success: false, reason: "Could not resolve address record" };
    }

    // Check if we actually have new data to add
    const hasNewData = addressData.street ||
      addressData.locality ||
      addressData.region ||
      addressData.country ||
      addressData.postalCode;

    if (!hasNewData) {
      stats.skipped++;
      return { success: false, reason: "No additional address data to add" };
    }

    // Update the database
    if (!isDryRun) {
      await db
        .update(checkinsTable)
        .set({
          venueName: addressData.name || checkin.venueName,
          addressStreet: addressData.street || null,
          addressLocality: addressData.locality || null,
          addressRegion: addressData.region || null,
          addressCountry: addressData.country || null,
          addressPostalCode: addressData.postalCode || null,
        })
        .where(eq(checkinsTable.id, checkin.id));
    }

    stats.updated++;
    stats.processed++;

    return {
      success: true,
      addressData: {
        name: addressData.name,
        street: addressData.street,
        locality: addressData.locality,
        region: addressData.region,
        country: addressData.country,
        postalCode: addressData.postalCode,
      },
    };
  } catch (error) {
    stats.errors++;
    return { success: false, reason: error.message };
  }
}

/**
 * Main backfill function for API use
 */
export async function backfillAddresses(
  limit: number = 50,
  isDryRun: boolean = false,
) {
  const stats: BackfillStats = {
    total: 0,
    processed: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
  };

  const results = [];

  try {
    // Find checkins that need backfill
    const checkins = await findCheckinsNeedingBackfill(limit);

    if (checkins.length === 0) {
      return {
        success: true,
        message: "No checkins found that need address backfill",
        stats,
        results: [],
      };
    }

    // Process each checkin
    for (const checkin of checkins) {
      const result = await processCheckin(checkin, stats, isDryRun);
      results.push({
        id: checkin.id,
        venueName: checkin.venueName,
        ...result,
      });

      // Add a small delay to be nice to the PDS servers
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      success: true,
      message: `Backfill ${isDryRun ? "dry run " : ""}completed`,
      stats: {
        ...stats,
        successRate: stats.total > 0
          ? Math.round((stats.updated / stats.total) * 100)
          : 0,
      },
      results,
      isDryRun,
    };
  } catch (error) {
    return {
      success: false,
      message: `Backfill failed: ${error.message}`,
      stats,
      results,
      error: error.message,
    };
  }
}
