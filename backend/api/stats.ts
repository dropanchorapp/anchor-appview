/**
 * Stats API endpoints
 * Handles system statistics and user data export
 */

import {
  exportUserData as exportUsers,
  getStatsResponse,
} from "../services/user-stats-service.ts";

export interface CorsHeaders {
  "Access-Control-Allow-Origin": string;
  "Access-Control-Allow-Methods": string;
  "Access-Control-Allow-Headers": string;
  "Content-Type": string;
  [key: string]: string;
}

/**
 * GET /api/stats - Get system statistics
 */
export async function getStats(corsHeaders: CorsHeaders): Promise<Response> {
  try {
    const statsResponse = await getStatsResponse();

    if (statsResponse.success && statsResponse.data) {
      return new Response(JSON.stringify(statsResponse), {
        headers: corsHeaders,
      });
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: statsResponse.error || "Failed to generate user statistics",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }
  } catch (error) {
    console.error("Stats endpoint error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

/**
 * GET /api/stats/export - Export user data
 */
export async function getUserDataExport(
  corsHeaders: CorsHeaders,
): Promise<Response> {
  try {
    const users = await exportUsers();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          users,
          totalUsers: users.length,
          exportedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("User data export error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to export user data",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}
