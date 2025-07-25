#!/usr/bin/env -S deno run --allow-net
/**
 * Debug script for Anchor AppView - runs locally with Deno
 *
 * Usage:
 *   deno run --allow-net scripts/debug.ts
 *   deno run --allow-net scripts/debug.ts --check-data
 *   deno run --allow-net scripts/debug.ts --test-api
 */

const ANCHOR_APPVIEW = "https://anchor-feed-generator.val.run";
const DASHBOARD_URL = "https://dropanchor-feed-dashboard.val.run";
const BLUESKY_PDS = "https://bsky.social";
const TEST_DID = "did:plc:wxex3wx5k4ctciupsv5m5stb";

interface DebugOptions {
  checkData: boolean;
  testApi: boolean;
}

function parseArgs(): DebugOptions {
  const args = Deno.args;
  return {
    checkData: args.includes("--check-data"),
    testApi: args.includes("--test-api"),
  };
}

async function checkDataAvailability() {
  console.log("🔍 Checking AT Protocol Data Availability");
  console.log("=".repeat(50));

  try {
    // Check for check-in records
    const url = `${BLUESKY_PDS}/xrpc/com.atproto.repo.listRecords`;
    const params = new URLSearchParams({
      repo: TEST_DID,
      collection: "app.dropanchor.checkin",
      limit: "10",
      reverse: "true",
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const records = data.records || [];

    console.log(`✅ Found ${records.length} check-in records`);

    if (records.length > 0) {
      console.log("\n📊 Record Analysis:");

      const newFormatCount = records.filter((r) => r.value.addressRef).length;
      const legacyFormatCount = records.filter((r) => r.value.locations).length;

      console.log(`   New format (addressRef): ${newFormatCount}`);
      console.log(`   Legacy format (locations): ${legacyFormatCount}`);

      if (newFormatCount > 0) {
        const newRecord = records.find((r) => r.value.addressRef);
        console.log("\n📍 Sample New Format Record:");
        console.log(`   URI: ${newRecord.uri}`);
        console.log(`   Text: "${newRecord.value.text}"`);
        console.log(
          `   Coordinates: ${newRecord.value.coordinates?.latitude}, ${newRecord.value.coordinates?.longitude}`,
        );
        console.log(`   AddressRef: ${newRecord.value.addressRef?.uri}`);
      }
    }

    return records.length;
  } catch (error) {
    console.log(`❌ Error checking data: ${error.message}`);
    return 0;
  }
}

async function testApiEndpoints() {
  console.log("\n🔌 Testing API Endpoints");
  console.log("=".repeat(30));

  const endpoints = [
    { name: "Dashboard", url: DASHBOARD_URL, expectHtml: true },
    { name: "Global Feed", url: `${ANCHOR_APPVIEW}/global`, expectJson: true },
    { name: "Stats", url: `${ANCHOR_APPVIEW}/stats`, expectJson: true },
    {
      name: "Nearby (Amsterdam)",
      url: `${ANCHOR_APPVIEW}/nearby?lat=52.3676&lng=4.9041&radius=5`,
      expectJson: true,
    },
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n🔍 Testing ${endpoint.name}...`);

      const response = await fetch(endpoint.url);
      const isOk = response.ok;
      const contentType = response.headers.get("content-type") || "";

      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Content-Type: ${contentType}`);

      if (
        isOk && endpoint.expectJson && contentType.includes("application/json")
      ) {
        const json = await response.json();
        console.log(
          `   Response: ${JSON.stringify(json).substring(0, 100)}...`,
        );

        if (endpoint.name === "Stats") {
          console.log(
            `   📊 Stats: ${json.totalCheckins} checkins, ${json.totalUsers} users`,
          );
        } else if (json.checkins) {
          console.log(`   📊 Data: ${json.checkins.length} checkins returned`);
        }
      } else if (isOk && endpoint.expectHtml) {
        const text = await response.text();
        console.log(`   📊 HTML: ${text.length} characters`);
      }

      results.push({
        name: endpoint.name,
        success: isOk,
        status: response.status,
      });
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({
        name: endpoint.name,
        success: false,
        error: error.message,
      });
    }
  }

  console.log("\n📊 API Test Summary:");
  results.forEach((result) => {
    const status = result.success
      ? `✅ ${result.status}`
      : `❌ ${result.error || "Failed"}`;
    console.log(`   ${result.name}: ${status}`);
  });

  return results;
}

async function showOverallStatus() {
  console.log("\n📈 Overall System Status");
  console.log("=".repeat(30));

  try {
    const statsResponse = await fetch(`${ANCHOR_APPVIEW}/stats`);
    if (statsResponse.ok) {
      const stats = await statsResponse.json();

      console.log(`📊 Database Status:`);
      console.log(`   Total Check-ins: ${stats.totalCheckins}`);
      console.log(`   Unique Users: ${stats.totalUsers}`);
      console.log(`   Recent Activity: ${stats.recentActivity} (24h)`);
      console.log(`   Last Processing: ${stats.lastProcessingRun || "Never"}`);

      if (stats.totalCheckins === 0) {
        console.log("\n⚠️  Database is empty - possible issues:");
        console.log("   • Jetstream poller not running");
        console.log("   • No new format records to process");
        console.log("   • Address resolution failing");
        console.log("   • Check Val Town cron job status");
      } else {
        console.log("\n✅ System appears to be working correctly");
      }
    }
  } catch (error) {
    console.log(`❌ Could not get system status: ${error.message}`);
  }
}

async function main() {
  console.log("🔍 Anchor AppView Debug Tool");
  console.log("=".repeat(50));

  const options = parseArgs();

  if (options.checkData) {
    const _recordCount = await checkDataAvailability();
    return;
  }

  if (options.testApi) {
    await testApiEndpoints();
    return;
  }

  // Default: run all checks
  const _recordCount = await checkDataAvailability();
  await testApiEndpoints();
  await showOverallStatus();

  console.log("\n🏁 Debug Complete!");
  console.log("\nNext steps:");
  console.log("  • Deploy the fixed Jetstream poller to Val Town");
  console.log("  • Run the backfill script to import new format records");
  console.log("  • Monitor the dashboard for data ingestion");
}

if (import.meta.main) {
  main().catch(console.error);
}
