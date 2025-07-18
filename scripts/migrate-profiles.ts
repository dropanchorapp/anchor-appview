// Migration script to populate profile cache from existing check-ins
// Run this once to backfill profile data for all existing authors

import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";
import { batchResolveProfiles, ensureProfileCacheTable } from "../src/utils/profile-resolver.ts";

async function migrateProfiles() {
  console.log("Starting profile migration...");
  
  // Ensure profile cache table exists
  await ensureProfileCacheTable();
  
  // Get all unique authors from check-ins
  const result = await sqlite.execute(`
    SELECT DISTINCT author_did 
    FROM checkins_v1 
    WHERE author_did IS NOT NULL
    ORDER BY author_did
  `);
  
  const dids = result.rows ? result.rows.map(row => row.author_did as string) : [];
  console.log(`Found ${dids.length} unique authors to process`);
  
  // Process in batches of 20
  const batchSize = 20;
  let processedCount = 0;
  
  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(dids.length / batchSize)}`);
    
    try {
      const profiles = await batchResolveProfiles(batch);
      processedCount += profiles.size;
      console.log(`Resolved ${profiles.size} profiles in this batch`);
    } catch (error) {
      console.error(`Error processing batch: ${error}`);
    }
    
    // Rate limit between batches
    if (i + batchSize < dids.length) {
      console.log("Waiting 2 seconds before next batch...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`Migration complete! Processed ${processedCount} profiles out of ${dids.length} authors`);
  
  // Update author_handle in check-ins from resolved profiles
  console.log("Updating check-in handles from profile cache...");
  
  const _updateResult = await sqlite.execute(`
    UPDATE checkins_v1 
    SET author_handle = (
      SELECT handle 
      FROM profile_cache_v1 
      WHERE profile_cache_v1.did = checkins_v1.author_did
    )
    WHERE EXISTS (
      SELECT 1 
      FROM profile_cache_v1 
      WHERE profile_cache_v1.did = checkins_v1.author_did
    )
  `);
  
  console.log(`Updated handles for existing check-ins`);
}

// Run the migration
if (import.meta.main) {
  migrateProfiles().catch(console.error);
}