/**
 * Service for migrating user checkins to ensure they conform to the current lexicon
 * Handles two types of migration:
 * 1. Format migration: old format (addressRef + coordinates) → new format (address + geo embedded)
 * 2. Coordinate migration: numeric coordinates → string coordinates (DAG-CBOR compliance)
 */

interface OAuthSession {
  did: string;
  pdsUrl: string;
  makeRequest: (
    method: string,
    url: string,
    options?: RequestInit,
  ) => Promise<Response>;
}

interface AddressData {
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

// deno-lint-ignore no-explicit-any
type CheckinRecord = any;

interface MigrationResult {
  formatMigrated: number;
  coordinateMigrated: number;
  addressesDeleted: number;
  failed: number;
  errors: string[];
}

/**
 * Check if record needs format migration (old addressRef format → new embedded format)
 */
function needsFormatMigration(record: CheckinRecord): boolean {
  return record.value?.addressRef && record.value?.coordinates &&
    !record.value?.address && !record.value?.geo;
}

/**
 * Check if record needs coordinate string migration (numbers → strings)
 * Only applies to new format records that have geo object
 */
function needsCoordinateMigration(record: CheckinRecord): boolean {
  const geo = record.value?.geo;
  if (!geo) return false;
  return typeof geo.latitude === "number" || typeof geo.longitude === "number";
}

/**
 * Fetch address record from PDS
 */
async function fetchAddressRecord(
  pdsUrl: string,
  addressRef: { uri: string; cid: string },
): Promise<AddressData | null> {
  try {
    // Extract DID and rkey from AT URI: at://did:plc:xxx/community.lexicon.location.address/rkey
    const parts = addressRef.uri.split("/");
    const did = parts[2];
    const rkey = parts[parts.length - 1];

    const response = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=community.lexicon.location.address&rkey=${rkey}`,
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.value;
  } catch {
    return null;
  }
}

/**
 * Delete address record from PDS (only after successful migration)
 */
async function deleteAddressRecord(
  oauthSession: OAuthSession,
  addressRkey: string,
): Promise<boolean> {
  try {
    const response = await oauthSession.makeRequest(
      "POST",
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: oauthSession.did,
          collection: "community.lexicon.location.address",
          rkey: addressRkey,
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Clean up orphan address records that are no longer referenced by any checkin
 */
async function cleanupOrphanAddressRecords(
  oauthSession: OAuthSession,
): Promise<number> {
  let deleted = 0;

  try {
    // List all address records
    const addressResponse = await fetch(
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${oauthSession.did}&collection=community.lexicon.location.address&limit=100`,
    );

    if (!addressResponse.ok) return 0;

    const addressData = await addressResponse.json();
    if (!addressData.records || addressData.records.length === 0) return 0;

    console.log(
      `🔍 Found ${addressData.records.length} address records to check for orphans`,
    );

    // Delete each address record (they're all orphans now since checkins use embedded addresses)
    for (const record of addressData.records) {
      const rkey = record.uri.split("/").pop();
      if (!rkey) continue;

      const success = await deleteAddressRecord(oauthSession, rkey);
      if (success) {
        deleted++;
        console.log(`  🗑️ Deleted orphan address: ${rkey}`);
      } else {
        console.warn(`  ⚠️ Failed to delete orphan address: ${rkey}`);
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (error) {
    console.error("Error cleaning up orphan addresses:", error);
  }

  return deleted;
}

/**
 * Migrate a checkin from old format (addressRef + coordinates) to new format (address + geo embedded)
 */
async function migrateCheckinFormat(
  record: CheckinRecord,
  oauthSession: OAuthSession,
): Promise<{ success: boolean; addressRkey?: string; error?: string }> {
  try {
    const rkey = record.uri.split("/").pop();
    if (!rkey) {
      return { success: false, error: "Could not extract rkey from URI" };
    }

    // 1. Fetch the referenced address record
    const addressData = await fetchAddressRecord(
      oauthSession.pdsUrl,
      record.value.addressRef,
    );
    if (!addressData) {
      return { success: false, error: "Could not fetch address record" };
    }

    // 2. Build new format record (preserve createdAt!)
    const newValue = {
      $type: "app.dropanchor.checkin",
      text: record.value.text,
      createdAt: record.value.createdAt, // PRESERVE original timestamp
      geo: {
        latitude: String(record.value.coordinates.latitude),
        longitude: String(record.value.coordinates.longitude),
      },
      address: {
        name: addressData.name,
        street: addressData.street,
        locality: addressData.locality,
        region: addressData.region,
        postalCode: addressData.postalCode,
        country: addressData.country || "XX", // Required field, fallback
      },
      // Preserve optional fields
      ...(record.value.category && { category: record.value.category }),
      ...(record.value.categoryGroup &&
        { categoryGroup: record.value.categoryGroup }),
      ...(record.value.categoryIcon &&
        { categoryIcon: record.value.categoryIcon }),
      ...(record.value.image && { image: record.value.image }),
    };

    // 3. Update record via putRecord
    const response = await oauthSession.makeRequest(
      "POST",
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.putRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: oauthSession.did,
          collection: "app.dropanchor.checkin",
          rkey: rkey,
          record: newValue,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `putRecord failed: ${errorText}` };
    }

    // Return address rkey for cleanup
    const addressRkey = record.value.addressRef.uri.split("/").pop();
    return { success: true, addressRkey };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Migrate a checkin record to have string coordinates (for new format records)
 */
async function migrateCheckinCoordinates(
  record: CheckinRecord,
  oauthSession: OAuthSession,
): Promise<{ success: boolean; error?: string }> {
  try {
    const rkey = record.uri.split("/").pop();
    if (!rkey) {
      return { success: false, error: "Could not extract rkey from URI" };
    }

    // Create updated record with string coordinates
    const updatedValue = {
      ...record.value,
      geo: {
        ...record.value.geo,
        latitude: String(record.value.geo.latitude),
        longitude: String(record.value.geo.longitude),
      },
    };

    // Update the record using putRecord
    const response = await oauthSession.makeRequest(
      "POST",
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.putRecord`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: oauthSession.did,
          collection: "app.dropanchor.checkin",
          rkey: rkey,
          record: updatedValue,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `PDS returned ${response.status}: ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Migrate all checkins for a user
 * - Converts old format (addressRef + coordinates) to new format (address + geo embedded)
 * - Converts numeric coordinates to strings for DAG-CBOR compliance
 * - Deletes old address records only after successful migration
 */
export async function migrateUserCheckins(
  oauthSession: OAuthSession,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    formatMigrated: 0,
    coordinateMigrated: 0,
    addressesDeleted: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Fetch all checkins for the user (with pagination)
    let cursor: string | undefined;
    const allRecords: CheckinRecord[] = [];

    do {
      const url = new URL(
        `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.listRecords`,
      );
      url.searchParams.set("repo", oauthSession.did);
      url.searchParams.set("collection", "app.dropanchor.checkin");
      url.searchParams.set("limit", "100");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const listResponse = await fetch(url.toString());

      if (!listResponse.ok) {
        result.errors.push(`Failed to fetch checkins: ${listResponse.status}`);
        return result;
      }

      const data = await listResponse.json();
      if (data.records) {
        allRecords.push(...data.records);
      }
      cursor = data.cursor;
    } while (cursor);

    if (allRecords.length === 0) {
      console.log(`✅ No checkins to migrate for ${oauthSession.did}`);
      return result;
    }

    console.log(
      `🔍 Checking ${allRecords.length} checkins for ${oauthSession.did}`,
    );

    // Process each record
    for (const record of allRecords) {
      const rkey = record.uri.split("/").pop();

      // Priority 1: Format migration (old addressRef → new embedded)
      if (needsFormatMigration(record)) {
        console.log(`  🔄 Format migrating ${rkey}`);

        const migrationResult = await migrateCheckinFormat(
          record,
          oauthSession,
        );

        if (migrationResult.success) {
          result.formatMigrated++;
          console.log(`  ✅ Format migrated ${rkey}`);

          // Delete old address record ONLY after successful migration
          if (migrationResult.addressRkey) {
            const deleted = await deleteAddressRecord(
              oauthSession,
              migrationResult.addressRkey,
            );
            if (deleted) {
              result.addressesDeleted++;
              console.log(
                `  🗑️ Deleted address record: ${migrationResult.addressRkey}`,
              );
            } else {
              console.warn(
                `  ⚠️ Could not delete address record: ${migrationResult.addressRkey}`,
              );
            }
          }
        } else {
          result.failed++;
          const errorMsg =
            `Failed to format migrate ${rkey}: ${migrationResult.error}`;
          result.errors.push(errorMsg);
          console.error(`  ❌ ${errorMsg}`);
          // DO NOT delete address record on failure
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // Priority 2: Coordinate string migration (for new format records)
      if (needsCoordinateMigration(record)) {
        console.log(`  📝 Coordinate migrating ${rkey}`);

        const migrationResult = await migrateCheckinCoordinates(
          record,
          oauthSession,
        );

        if (migrationResult.success) {
          result.coordinateMigrated++;
          console.log(`  ✅ Coordinate migrated ${rkey}`);
        } else {
          result.failed++;
          const errorMsg =
            `Failed to coordinate migrate ${rkey}: ${migrationResult.error}`;
          result.errors.push(errorMsg);
          console.error(`  ❌ ${errorMsg}`);
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const totalMigrated = result.formatMigrated + result.coordinateMigrated;
    if (totalMigrated > 0 || result.failed > 0) {
      console.log(
        `✅ Migration complete for ${oauthSession.did}: ${result.formatMigrated} format, ${result.coordinateMigrated} coordinate, ${result.addressesDeleted} addresses deleted, ${result.failed} failed`,
      );
    } else {
      console.log(
        `✅ All ${allRecords.length} checkins already in correct format for ${oauthSession.did}`,
      );
    }

    // Clean up any orphan address records (no longer referenced by any checkin)
    const orphansDeleted = await cleanupOrphanAddressRecords(oauthSession);
    if (orphansDeleted > 0) {
      result.addressesDeleted += orphansDeleted;
      console.log(`🧹 Cleaned up ${orphansDeleted} orphan address records`);
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Migration error: ${errorMsg}`);
    console.error(`❌ Migration error for ${oauthSession.did}:`, error);
    return result;
  }
}

/**
 * Run migration in background (don't block user login)
 */
export function migrateUserCheckinsInBackground(
  oauthSession: OAuthSession,
): void {
  // Run migration without awaiting
  migrateUserCheckins(oauthSession)
    .then((result) => {
      const totalMigrated = result.formatMigrated + result.coordinateMigrated;
      if (totalMigrated > 0 || result.failed > 0) {
        console.log(
          `🎉 Background migration completed for ${oauthSession.did}: ${result.formatMigrated} format, ${result.coordinateMigrated} coordinate, ${result.addressesDeleted} addresses deleted, ${result.failed} failed`,
        );
      }
    })
    .catch((error) => {
      console.error(
        `❌ Background migration failed for ${oauthSession.did}:`,
        error,
      );
    });
}
