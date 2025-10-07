/**
 * Test script to verify the user stats functionality
 */

import {
  exportUserData,
  generateUserStats,
} from "../backend/services/user-stats-service.ts";

export default async function testUserStats() {
  try {
    console.log("🧪 Testing User Stats Service...");

    // Test generating user statistics
    console.log("\n📊 Generating user statistics...");
    const stats = await generateUserStats();

    console.log("✅ User Statistics Generated:");
    console.log(`   Total Users: ${stats.totalUsers}`);
    console.log(`   Active Users: ${stats.activeUsers}`);
    console.log(`   Expired Users: ${stats.expiredUsers}`);
    console.log(`   Unique PDS Servers: ${stats.uniquePdsServers}`);

    console.log("\n🏆 Top PDS Servers:");
    stats.topPdsServers.forEach((server, i) => {
      console.log(`   ${i + 1}. ${server.pdsUrl} (${server.userCount} users)`);
    });

    console.log("\n👥 Recent Users:");
    stats.recentUsers.slice(0, 5).forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.handle} (${user.did}) - ${user.pdsUrl}`);
    });

    // Test exporting user data
    console.log("\n📋 Exporting user data...");
    const users = await exportUserData();

    console.log(`✅ Exported ${users.length} unique users`);

    console.log("\n🎯 Sample User Data:");
    users.slice(0, 3).forEach((user, i) => {
      console.log(`   ${i + 1}. DID: ${user.did}`);
      console.log(`      Handle: ${user.handle}`);
      console.log(`      PDS: ${user.pdsUrl}`);
      console.log(`      Created: ${new Date(user.createdAt).toISOString()}`);
      console.log(`      Expired: ${user.isExpired ? "Yes" : "No"}`);
      console.log("");
    });

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        exportedUsers: users.length,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
