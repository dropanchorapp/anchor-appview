#!/usr/bin/env deno run --allow-net --allow-env
/**
 * Admin tool to backfill missing address data from StrongRefs
 *
 * This tool finds checkins that have coordinates but missing address components,
 * fetches their original AT Protocol records to get StrongRefs, resolves those
 * StrongRefs to get full address data, and updates the database.
 *
 * Usage:
 *   deno run --allow-net --allow-env admin/backfill-addresses.ts [--dry-run] [--limit=100]
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

// Parse command line arguments
const args = Deno.args;
const isDryRun = args.includes("--dry-run");
const limitMatch = args.find((arg) => arg.startsWith("--limit="));
const limit = limitMatch ? parseInt(limitMatch.split("=")[1]) : undefined;

console.log("🔧 Address Backfill Admin Tool");
console.log("===============================");
console.log(`Mode: ${isDryRun ? "DRY RUN (no database changes)" : "LIVE RUN"}`);
if (limit) console.log(`Limit: ${limit} records`);
console.log("");

/**
 * Resolve address record from AT Protocol URI
 * Reuses the logic from record-processor.ts
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
async function findCheckinsNeedingBackfill() {
  console.log("🔍 Finding checkins that need address backfill...");

  // Find checkins with coordinates but missing address components
  // These likely have StrongRefs that weren't resolved
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

  const checkins = await (limit ? baseQuery.limit(limit) : baseQuery);

  console.log(
    `Found ${checkins.length} checkins that may need address backfill`,
  );
  return checkins;
}

/**
 * Process a single checkin for address backfill
 */
async function processCheckin(checkin: any, stats: BackfillStats) {
  stats.total++;

  console.log(
    `\n[${stats.total}] Processing: ${
      checkin.venueName || "Unknown"
    } (${checkin.id})`,
  );

  try {
    // Fetch the original AT Protocol record
    const record = await fetchCheckinRecord(checkin.uri);
    if (!record) {
      console.log(`  ❌ Could not fetch AT Protocol record`);
      stats.errors++;
      return;
    }

    // Check if it has a StrongRef
    if (!record.addressRef?.uri) {
      console.log(`  ⏭️  No StrongRef found - skipping`);
      stats.skipped++;
      return;
    }

    console.log(`  🔗 Found StrongRef: ${record.addressRef.uri}`);

    // Resolve the address record
    const addressData = await resolveAddressRecord(
      record.addressRef.uri,
      checkin.did,
    );
    if (!addressData) {
      console.log(`  ❌ Could not resolve address record`);
      stats.errors++;
      return;
    }

    console.log(`  📍 Resolved address: ${addressData.name || "Unnamed"}`);
    if (addressData.street) console.log(`     Street: ${addressData.street}`);
    if (addressData.locality) {
      console.log(`     Locality: ${addressData.locality}`);
    }
    if (addressData.region) console.log(`     Region: ${addressData.region}`);
    if (addressData.country) {
      console.log(`     Country: ${addressData.country}`);
    }

    // Check if we actually have new data to add
    const hasNewData = addressData.street ||
      addressData.locality ||
      addressData.region ||
      addressData.country ||
      addressData.postalCode;

    if (!hasNewData) {
      console.log(`  ⏭️  No additional address data to add`);
      stats.skipped++;
      return;
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

    console.log(`  ✅ ${isDryRun ? "Would update" : "Updated"} database`);
    stats.updated++;
    stats.processed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Main backfill function
 */
async function backfillAddresses() {
  const stats: BackfillStats = {
    total: 0,
    processed: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
  };

  try {
    // Find checkins that need backfill
    const checkins = await findCheckinsNeedingBackfill();

    if (checkins.length === 0) {
      console.log("✅ No checkins found that need address backfill!");
      return;
    }

    console.log(`\n🚀 Starting backfill process...`);

    // Process each checkin
    for (const checkin of checkins) {
      await processCheckin(checkin, stats);

      // Add a small delay to be nice to the PDS servers
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error("\n💥 Fatal error:", error);
    throw error;
  } finally {
    // Print final stats
    console.log("\n" + "=".repeat(40));
    console.log("📊 BACKFILL COMPLETE");
    console.log("=".repeat(40));
    console.log(`Total processed: ${stats.total}`);
    console.log(`Successfully updated: ${stats.updated}`);
    console.log(`Skipped (no data): ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(
      `Success rate: ${
        stats.total > 0 ? Math.round((stats.updated / stats.total) * 100) : 0
      }%`,
    );

    if (isDryRun) {
      console.log("\n⚠️  This was a DRY RUN - no database changes were made");
      console.log("   Run without --dry-run to actually update the database");
    }
  }
}

// Run the backfill
if (import.meta.main) {
  await backfillAddresses();
}
