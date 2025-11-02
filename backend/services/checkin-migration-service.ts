/**
 * Service for migrating user checkins to ensure they conform to the current lexicon
 * Specifically handles coordinate format migration from floats to strings (DAG-CBOR compliance)
 */

interface OAuthSession {
  did: string;
  pdsUrl: string;
  makeRequest: (
    method: string,
    url: string,
    options?: any,
  ) => Promise<Response>;
}

interface CheckinRecord {
  uri: string;
  cid: string;
  value: {
    $type: string;
    text: string;
    createdAt: string;
    coordinates: {
      latitude: string | number;
      longitude: string | number;
    };
    addressRef: {
      uri: string;
      cid: string;
    };
    category?: string;
    categoryGroup?: string;
    categoryIcon?: string;
    image?: any;
  };
}

/**
 * Check if coordinates need migration (are numbers instead of strings)
 */
function needsCoordinateMigration(record: CheckinRecord): boolean {
  const coords = record.value.coordinates;
  return typeof coords.latitude === "number" ||
    typeof coords.longitude === "number";
}

/**
 * Migrate a single checkin record to have string coordinates
 */
async function migrateCheckinRecord(
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
      coordinates: {
        latitude: String(record.value.coordinates.latitude),
        longitude: String(record.value.coordinates.longitude),
      },
    };

    // Update the record using putRecord (updates existing record)
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
 * Migrate all checkins for a user to ensure coordinates are strings
 * Returns count of migrated records
 */
export async function migrateUserCheckins(
  oauthSession: OAuthSession,
): Promise<{ migrated: number; failed: number; errors: string[] }> {
  const result = {
    migrated: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Fetch all checkins for the user
    const listResponse = await fetch(
      `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${oauthSession.did}&collection=app.dropanchor.checkin&limit=100`,
    );

    if (!listResponse.ok) {
      result.errors.push(
        `Failed to fetch checkins: ${listResponse.status}`,
      );
      return result;
    }

    const data = await listResponse.json();

    if (!data.records || data.records.length === 0) {
      console.log(`✅ No checkins to migrate for ${oauthSession.did}`);
      return result;
    }

    console.log(
      `🔍 Checking ${data.records.length} checkins for ${oauthSession.did}`,
    );

    // Find records that need migration
    const recordsToMigrate = data.records.filter((record: CheckinRecord) =>
      needsCoordinateMigration(record)
    );

    if (recordsToMigrate.length === 0) {
      console.log(
        `✅ All ${data.records.length} checkins already have valid coordinates for ${oauthSession.did}`,
      );
      return result;
    }

    console.log(
      `🔧 Migrating ${recordsToMigrate.length} checkins with invalid coordinates for ${oauthSession.did}`,
    );

    // Migrate each record
    for (const record of recordsToMigrate) {
      const rkey = record.uri.split("/").pop();
      console.log(
        `  📝 Migrating ${rkey}: lat=${record.value.coordinates.latitude} (${typeof record
          .value.coordinates
          .latitude}), lng=${record.value.coordinates.longitude} (${typeof record
          .value.coordinates.longitude})`,
      );

      const migrationResult = await migrateCheckinRecord(
        record,
        oauthSession,
      );

      if (migrationResult.success) {
        result.migrated++;
        console.log(`  ✅ Migrated ${rkey}`);
      } else {
        result.failed++;
        const errorMsg = `Failed to migrate ${rkey}: ${migrationResult.error}`;
        result.errors.push(errorMsg);
        console.error(`  ❌ ${errorMsg}`);
      }

      // Add small delay between migrations to avoid rate limits
      if (recordsToMigrate.length > 5) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (result.migrated > 0) {
      console.log(
        `✅ Migration complete for ${oauthSession.did}: ${result.migrated} migrated, ${result.failed} failed`,
      );
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
      if (result.migrated > 0 || result.failed > 0) {
        console.log(
          `🎉 Background migration completed for ${oauthSession.did}: ${result.migrated} migrated, ${result.failed} failed`,
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
