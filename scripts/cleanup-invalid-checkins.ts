// Cleanup script to remove checkins with invalid coordinate data
// This removes checkins that have null, undefined, or invalid coordinates

import { db, initializeTables } from "../backend/database/db.ts";

interface InvalidCheckin {
  id: string;
  uri: string;
  did: string;
  handle: string;
  text: string;
  latitude: any;
  longitude: any;
  created_at: string;
}

async function cleanupInvalidCheckins(): Promise<void> {
  console.log("🧹 Starting cleanup of checkins with invalid coordinates...");

  try {
    await initializeTables();

    // Find checkins with invalid coordinates
    console.log("🔍 Finding checkins with invalid coordinates...");

    const invalidCheckinsResult = await db.execute(`
      SELECT id, uri, did, handle, text, latitude, longitude, created_at
      FROM checkins 
      WHERE latitude IS NULL 
         OR longitude IS NULL 
         OR latitude = 'undefined' 
         OR longitude = 'undefined'
         OR latitude = '' 
         OR longitude = ''
         OR (typeof(latitude) = 'text' AND latitude NOT GLOB '*[0-9]*')
         OR (typeof(longitude) = 'text' AND longitude NOT GLOB '*[0-9]*')
    `);

    if (
      !invalidCheckinsResult.rows || invalidCheckinsResult.rows.length === 0
    ) {
      console.log("✅ No checkins with invalid coordinates found");
      return;
    }

    const invalidCheckins = invalidCheckinsResult
      .rows as unknown as InvalidCheckin[];
    console.log(
      `📊 Found ${invalidCheckins.length} checkins with invalid coordinates:`,
    );

    // Display what will be deleted
    for (const checkin of invalidCheckins) {
      console.log(
        `   ❌ ${
          checkin.handle || checkin.did
        }: "${checkin.text}" (lat=${checkin.latitude}, lng=${checkin.longitude})`,
      );
    }

    // Confirm before deletion
    console.log(
      `\n⚠️  About to delete ${invalidCheckins.length} checkins with invalid coordinates`,
    );

    // Delete invalid checkins
    console.log("🗑️ Removing checkins with invalid coordinates...");

    let deletedCount = 0;
    for (const checkin of invalidCheckins) {
      try {
        await db.execute("DELETE FROM checkins WHERE id = ?", [checkin.id]);
        deletedCount++;
        console.log(
          `   ✅ Deleted: ${checkin.handle || checkin.did} - "${checkin.text}"`,
        );
      } catch (error) {
        console.error(`   ❌ Failed to delete checkin ${checkin.id}:`, error);
      }
    }

    // Final statistics
    console.log(`\n=== Cleanup Summary ===`);
    console.log(`Invalid checkins found: ${invalidCheckins.length}`);
    console.log(`Successfully deleted: ${deletedCount}`);
    console.log(`Failed to delete: ${invalidCheckins.length - deletedCount}`);

    // Show remaining checkin count
    const remainingResult = await db.execute(
      "SELECT COUNT(*) as count FROM checkins",
    );
    const remainingCount = remainingResult.rows?.[0]?.count || 0;
    console.log(`Remaining valid checkins: ${remainingCount}`);
    console.log("=====================");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    throw error;
  }
}

// Run the cleanup
if (import.meta.main) {
  await cleanupInvalidCheckins();
}

export default cleanupInvalidCheckins;
