// Simple diagnostic to check anchor_users table
import { db } from "../database/db.ts";
import { anchorUsersTable } from "../database/schema.ts";
import { count } from "https://esm.sh/drizzle-orm@0.44.5";

export async function simpleUserCheck() {
  console.log("🔍 Running simple user check...");

  try {
    // Just count total users first
    const totalUsers = await db
      .select({ count: count() })
      .from(anchorUsersTable);

    console.log(
      `Total users in anchor_users table: ${totalUsers[0]?.count || 0}`,
    );

    if ((totalUsers[0]?.count || 0) > 0) {
      // Try to get just the first few users without ordering
      const users = await db
        .select()
        .from(anchorUsersTable)
        .limit(3);

      console.log("First 3 users:", users);
    }

    return {
      success: true,
      totalUsers: totalUsers[0]?.count || 0,
    };
  } catch (error) {
    console.error("❌ Simple user check failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default simpleUserCheck;
