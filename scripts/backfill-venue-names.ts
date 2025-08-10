// @val-town backfillVenueNames
// Backfill script to add venue names to existing check-ins using OverpassService
import { db, initializeTables } from "../backend/database/db.ts";
import { OverpassService } from "../backend/services/overpass-service.ts";

interface CheckinToUpdate {
  id: string;
  latitude: number;
  longitude: number;
  current_name: string | null;
}

export default async function (): Promise<Response> {
  const output: string[] = [];
  let totalProcessed = 0;
  let totalUpdated = 0;
  let errors = 0;
  const startTime = Date.now();

  try {
    output.push("🔄 Backfilling venue names for existing check-ins...");
    await initializeTables();

    // Find all check-ins that have coordinates but no cached venue name
    const results = await db.execute(`
      SELECT id, latitude, longitude, cached_address_name
      FROM checkins 
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND (cached_address_name IS NULL OR cached_address_name = '')
      ORDER BY created_at DESC
    `);

    const checkinsToUpdate: CheckinToUpdate[] = (results.rows || []).map((
      row,
    ) => ({
      id: row.id as string,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      current_name: row.cached_address_name as string | null,
    }));

    output.push(
      `📍 Found ${checkinsToUpdate.length} check-ins needing venue names`,
    );

    if (checkinsToUpdate.length === 0) {
      output.push("✨ All check-ins already have venue names!");
      return new Response(output.join("\n"), {
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Initialize OverpassService
    const overpassService = new OverpassService();

    // Process each check-in
    for (const checkin of checkinsToUpdate) {
      totalProcessed++;
      output.push(
        `\n🔍 Processing checkin ${checkin.id} (${checkin.latitude}, ${checkin.longitude})`,
      );

      try {
        // Find nearby places within 100m radius
        const nearbyPlaces = await overpassService.findNearbyPlaces(
          { latitude: checkin.latitude, longitude: checkin.longitude },
          100, // 100 meter radius
          [], // All categories
        );

        if (nearbyPlaces.length > 0) {
          // Use the first (closest) place found
          const nearestPlace = nearbyPlaces[0];
          const venueName = nearestPlace.name;

          // Update the check-in with venue name and additional address data
          await db.execute(
            `
            UPDATE checkins SET 
              cached_address_name = ?,
              cached_address_street = ?,
              cached_address_locality = ?,
              cached_address_region = ?,
              cached_address_country = ?,
              cached_address_postal_code = ?,
              address_resolved_at = ?
            WHERE id = ?
          `,
            [
              venueName,
              nearestPlace.tags?.["addr:street"] || null,
              nearestPlace.tags?.["addr:city"] ||
              nearestPlace.tags?.["addr:locality"] || null,
              nearestPlace.tags?.["addr:state"] ||
              nearestPlace.tags?.["addr:province"] || null,
              nearestPlace.tags?.["addr:country"] || null,
              nearestPlace.tags?.["addr:postcode"] || null,
              new Date().toISOString(),
              checkin.id,
            ],
          );

          totalUpdated++;
          output.push(`   ✅ Updated with venue: "${venueName}"`);
        } else {
          output.push(`   ⚠️  No nearby venues found within 100m`);
        }

        // Rate limiting: wait 500ms between requests to be respectful to Overpass API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        errors++;
        output.push(`   ❌ Error processing checkin: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;

    // Log the backfill run
    await db.execute(
      `INSERT INTO processing_log (run_at, events_processed, errors, duration_ms) VALUES (?, ?, ?, ?)`,
      [new Date().toISOString(), totalUpdated, errors, duration],
    );

    output.push(`\n📊 Venue Name Backfill Summary:`);
    output.push(`   Check-ins processed: ${totalProcessed}`);
    output.push(`   Check-ins updated with venue names: ${totalUpdated}`);
    output.push(`   Errors: ${errors}`);
    output.push(`   Duration: ${Math.round(duration / 1000)}s`);
    output.push(`\n🏁 Venue name backfill complete!`);

    return new Response(output.join("\n"), {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    output.push(`\n❌ Venue name backfill failed: ${error.message}`);
    output.push(`Duration: ${Math.round(duration / 1000)}s`);

    return new Response(output.join("\n"), {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
