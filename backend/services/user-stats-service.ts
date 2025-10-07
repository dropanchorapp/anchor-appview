/**
 * User Statistics Service
 * Extracts user counts, handles, and PDS server information from OAuth sessions
 */

import { db } from "../database/db.ts";
import { ironSessionStorageTable } from "../database/schema.ts";
import { like } from "https://esm.sh/drizzle-orm@0.44.5";

export interface UserSession {
  did: string;
  handle: string;
  pdsUrl: string;
  createdAt: number;
  expiresAt?: number;
  isExpired: boolean;
  checkinCount?: number;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  expiredUsers: number;
  uniquePdsServers: number;
  usersByPds: Record<string, number>;
  recentUsers: UserSession[];
  topPdsServers: Array<{ pdsUrl: string; userCount: number }>;
  totalCheckins: number;
  averageCheckinsPerUser: number;
  usersWithCheckins: number;
  topUsersByCheckins: Array<
    { did: string; handle: string; checkinCount: number }
  >;
}

export interface StatsResponse {
  success: boolean;
  data?: UserStats;
  error?: string;
  timestamp: string;
}

/**
 * Extract session data from the database and parse it into a UserSession object
 */
function parseSessionData(
  sessionKey: string,
  sessionValue: string,
): UserSession | null {
  try {
    const sessionData = JSON.parse(sessionValue);
    const did = sessionKey.replace("session:", "");

    return {
      did,
      handle: sessionData.handle || "unknown",
      pdsUrl: sessionData.pdsUrl || "unknown",
      createdAt: sessionData.createdAt || Date.now(),
      expiresAt: sessionData.expiresAt,
      isExpired: sessionData.expiresAt
        ? new Date() > new Date(sessionData.expiresAt)
        : false,
    };
  } catch (error) {
    console.error(`Failed to parse session data for ${sessionKey}:`, error);
    return null;
  }
}

/**
 * Get checkin count for a specific user from their PDS
 */
async function getUserCheckinCount(
  did: string,
  pdsUrl: string,
): Promise<number> {
  try {
    let cursor: string | undefined;
    let totalCount = 0;

    do {
      const listRecordsUrl = cursor
        ? `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.dropanchor.checkin&limit=100&cursor=${cursor}`
        : `${pdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.dropanchor.checkin&limit=100`;

      const response = await fetch(listRecordsUrl);

      if (!response.ok) {
        if (response.status === 404) {
          // User has no checkins or collection doesn't exist
          return 0;
        }
        throw new Error(`Failed to fetch checkins: ${response.status}`);
      }

      const data = await response.json();
      totalCount += data.records?.length || 0;
      cursor = data.cursor;

      // Prevent infinite loops
      if (totalCount > 10000) {
        console.warn(
          `User ${did} has more than 10,000 checkins, capping count`,
        );
        break;
      }
    } while (cursor);

    return totalCount;
  } catch (error) {
    console.error(`Failed to get checkin count for user ${did}:`, error);
    return 0;
  }
}

/**
 * Get all OAuth sessions from the database
 */
async function getAllSessions(): Promise<UserSession[]> {
  try {
    const sessions = await db.select().from(ironSessionStorageTable)
      .where(like(ironSessionStorageTable.key, "session:%"));

    const userSessions: UserSession[] = [];

    for (const session of sessions) {
      const parsed = parseSessionData(session.key, session.value);
      if (parsed) {
        userSessions.push(parsed);
      }
    }

    return userSessions;
  } catch (error) {
    console.error("Failed to get sessions:", error);
    throw error;
  }
}

/**
 * Generate comprehensive user statistics from session data
 */
export async function generateUserStats(): Promise<UserStats> {
  const sessions = await getAllSessions();

  // Filter active vs expired sessions
  const activeSessions = sessions.filter((s) => !s.isExpired);
  const expiredSessions = sessions.filter((s) => s.isExpired);

  // Get unique users (by DID)
  const uniqueSessions = sessions.filter((session, index, self) =>
    index === self.findIndex((s) => s.did === session.did)
  );

  // Group users by PDS server
  const usersByPds: Record<string, number> = {};
  sessions.forEach((session) => {
    const pds = session.pdsUrl;
    usersByPds[pds] = (usersByPds[pds] || 0) + 1;
  });

  // Get top PDS servers by user count
  const topPdsServers = Object.entries(usersByPds)
    .map(([pdsUrl, userCount]) => ({ pdsUrl, userCount }))
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 10); // Top 10 servers

  // Get most recent users (last 10 sessions by creation time)
  const recentUsers = sessions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);

  // Get checkin counts for each unique user
  console.log(
    `📊 Fetching checkin counts for ${uniqueSessions.length} users...`,
  );
  const usersWithCheckins = [];
  let totalCheckins = 0;

  for (const user of uniqueSessions) {
    try {
      const checkinCount = await getUserCheckinCount(user.did, user.pdsUrl);
      user.checkinCount = checkinCount;
      totalCheckins += checkinCount;

      if (checkinCount > 0) {
        usersWithCheckins.push({
          did: user.did,
          handle: user.handle,
          checkinCount,
        });
      }
    } catch (error) {
      console.error(`Failed to get checkin count for ${user.did}:`, error);
      user.checkinCount = 0;
    }

    // Add small delay to avoid overwhelming PDS servers
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Sort users by checkin count for top users list
  const topUsersByCheckins = usersWithCheckins
    .sort((a, b) => b.checkinCount - a.checkinCount)
    .slice(0, 10);

  const averageCheckinsPerUser = uniqueSessions.length > 0
    ? Math.round((totalCheckins / uniqueSessions.length) * 100) / 100
    : 0;

  return {
    totalUsers: uniqueSessions.length,
    activeUsers: activeSessions.length,
    expiredUsers: expiredSessions.length,
    uniquePdsServers: Object.keys(usersByPds).length,
    usersByPds,
    recentUsers,
    topPdsServers,
    totalCheckins,
    averageCheckinsPerUser,
    usersWithCheckins: usersWithCheckins.length,
    topUsersByCheckins,
  };
}

/**
 * Get user statistics as a JSON response
 */
export async function getStatsResponse(): Promise<StatsResponse> {
  try {
    const stats = await generateUserStats();

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to generate user stats:", error);

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Export user data for analysis (returns all unique users with their info)
 */
export async function exportUserData(): Promise<UserSession[]> {
  const sessions = await getAllSessions();

  // Return unique users only (by DID), with most recent session data
  const uniqueUsers = new Map<string, UserSession>();

  sessions.forEach((session) => {
    const existing = uniqueUsers.get(session.did);
    if (!existing || session.createdAt > existing.createdAt) {
      uniqueUsers.set(session.did, session);
    }
  });

  return Array.from(uniqueUsers.values());
}
