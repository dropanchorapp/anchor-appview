#!/usr/bin/env deno

// Quick script to check address resolution status
import { db } from "../backend/database/db.ts";
import { getUnresolvedAddresses } from "../backend/utils/address-resolver.ts";

console.log("🔍 Checking address resolution status...");

// Check how many checkins have addresses vs coordinates only
const checkinsWithCoords = await db.execute(`
  SELECT COUNT(*) as count 
  FROM checkins 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
`);

const checkinsWithAddresses = await db.execute(`
  SELECT COUNT(*) as count 
  FROM checkins 
  WHERE cached_address_name IS NOT NULL 
  OR cached_address_street IS NOT NULL 
  OR cached_address_locality IS NOT NULL
`);

const unresolvedAddresses = await getUnresolvedAddresses(10);

console.log(
  `📊 Checkins with coordinates: ${checkinsWithCoords.rows[0].count}`,
);
console.log(
  `📍 Checkins with resolved addresses: ${checkinsWithAddresses.rows[0].count}`,
);
console.log(`⏳ Unresolved addresses: ${unresolvedAddresses.length}`);

if (unresolvedAddresses.length > 0) {
  console.log("\n📋 Sample unresolved addresses:");
  for (const addr of unresolvedAddresses.slice(0, 3)) {
    console.log(`  - ${addr.checkinId}: ${addr.addressRef.uri}`);
  }
}

// Show some sample resolved addresses
const sampleResolved = await db.execute(`
  SELECT 
    id, 
    cached_address_name, 
    cached_address_street, 
    cached_address_locality,
    latitude,
    longitude
  FROM checkins 
  WHERE cached_address_name IS NOT NULL 
  LIMIT 3
`);

if (sampleResolved.rows.length > 0) {
  console.log("\n✅ Sample resolved addresses:");
  for (const row of sampleResolved.rows) {
    const address = [
      row.cached_address_name,
      row.cached_address_street,
      row.cached_address_locality,
    ].filter(Boolean).join(", ");
    console.log(
      `  - ${row.id}: "${address}" (${row.latitude}, ${row.longitude})`,
    );
  }
}
