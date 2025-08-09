#!/usr/bin/env deno

// Script to resolve any unresolved addresses
import {
  batchResolveAddresses,
  getUnresolvedAddresses,
} from "../backend/utils/address-resolver.ts";

console.log("🔍 Starting address resolution process...");

try {
  // Get unresolved addresses (limit to 20 at a time to avoid overwhelming)
  const unresolvedAddresses = await getUnresolvedAddresses(20);

  if (unresolvedAddresses.length === 0) {
    console.log("✅ No unresolved addresses found!");
    Deno.exit(0);
  }

  console.log(`📋 Found ${unresolvedAddresses.length} unresolved addresses`);

  // Resolve them in batches
  const result = await batchResolveAddresses(unresolvedAddresses);

  console.log(`🎉 Resolution complete:`);
  console.log(`  ✅ Resolved: ${result.resolved}`);
  console.log(`  ❌ Errors: ${result.errors}`);
} catch (error) {
  console.error("❌ Address resolution failed:", error);
  Deno.exit(1);
}
