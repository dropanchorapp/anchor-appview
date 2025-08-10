// Query functions using raw SQL with Val Town's sqlite
import { db } from "./db.ts";

// Profile queries
export async function getProfileByDid(did: string) {
  const result = await db.execute(
    "SELECT * FROM profile_cache WHERE did = ?",
    [did],
  );
  return result.rows[0] || null;
}

export async function upsertProfile(profile: {
  did: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}) {
  const now = new Date().toISOString();
  await db.execute(
    `
    INSERT INTO profile_cache (did, handle, display_name, avatar_url, indexed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(did) DO UPDATE SET
      handle = ?,
      display_name = ?,
      avatar_url = ?,
      updated_at = ?
  `,
    [
      profile.did,
      profile.handle,
      profile.displayName,
      profile.avatarUrl,
      now,
      now,
      profile.handle,
      profile.displayName,
      profile.avatarUrl,
      now,
    ],
  );
}

// Checkin queries
export async function getRecentCheckins(limit = 50) {
  const result = await db.execute(
    `
    SELECT 
      c.id,
      c.uri,
      c.did,
      c.text,
      c.created_at,
      c.latitude,
      c.longitude,
      c.cached_address_name,
      c.cached_address_street,
      c.cached_address_locality,
      c.cached_address_region,
      c.cached_address_country,
      c.cached_address_postal_code,
      p.handle,
      p.display_name,
      p.avatar_url
    FROM checkins c
    LEFT JOIN profile_cache p ON c.did = p.did
    ORDER BY c.created_at DESC
    LIMIT ?
  `,
    [limit],
  );

  return result.rows.map((row: any) => {
    // Check if we have resolved address data
    const hasAddressData = row.cached_address_name ||
      row.cached_address_street ||
      row.cached_address_locality || row.cached_address_region ||
      row.cached_address_country || row.cached_address_postal_code;

    // Only include address if we have resolved address data from strongrefs
    const address = hasAddressData
      ? {
        name: row.cached_address_name,
        street: row.cached_address_street,
        locality: row.cached_address_locality,
        region: row.cached_address_region,
        country: row.cached_address_country,
        postalCode: row.cached_address_postal_code,
      }
      : undefined;

    return {
      id: row.id,
      uri: row.uri,
      author: {
        did: row.did,
        handle: row.handle || "unknown",
        displayName: row.display_name,
        avatar: row.avatar_url,
      },
      text: row.text,
      createdAt: row.created_at,
      coordinates: row.latitude && row.longitude
        ? {
          latitude: row.latitude,
          longitude: row.longitude,
        }
        : undefined,
      address,
    };
  });
}

export async function insertCheckin(checkin: {
  id: string;
  uri: string;
  did: string;
  text: string;
  latitude?: number;
  longitude?: number;
  cached_address_name?: string;
  cached_address_street?: string;
  cached_address_locality?: string;
  cached_address_region?: string;
  cached_address_country?: string;
  cached_address_postal_code?: string;
  created_at: string;
}) {
  const now = new Date().toISOString();
  await db.execute(
    `
    INSERT INTO checkins (
      id, uri, did, text, latitude, longitude,
      cached_address_name, cached_address_street, cached_address_locality, cached_address_region,
      cached_address_country, cached_address_postal_code, created_at, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      checkin.id,
      checkin.uri,
      checkin.did,
      checkin.text,
      checkin.latitude,
      checkin.longitude,
      checkin.cached_address_name,
      checkin.cached_address_street,
      checkin.cached_address_locality,
      checkin.cached_address_region,
      checkin.cached_address_country,
      checkin.cached_address_postal_code,
      checkin.created_at,
      now,
    ],
  );
}

// Dashboard stats
export async function getDashboardStats() {
  const totalCheckinsResult = await db.execute(
    "SELECT COUNT(*) as count FROM checkins",
  );
  const uniqueUsersResult = await db.execute(
    "SELECT COUNT(DISTINCT did) as count FROM checkins",
  );

  const recentCheckinsResult = await db.execute(`
    SELECT 
      c.id, c.uri, c.did, c.text, c.created_at,
      c.cached_address_name, c.cached_address_locality, c.cached_address_region, c.cached_address_country,
      p.handle, p.display_name
    FROM checkins c
    LEFT JOIN profile_cache p ON c.did = p.did
    ORDER BY c.created_at DESC
    LIMIT 20
  `);

  const recentCheckins = recentCheckinsResult.rows.map((row: any) => ({
    id: row.id,
    uri: row.uri,
    author: {
      did: row.did,
      handle: row.handle || "unknown",
      displayName: row.display_name,
    },
    text: row.text,
    createdAt: row.created_at,
    address: {
      name: row.cached_address_name,
      locality: row.cached_address_locality,
      region: row.cached_address_region,
      country: row.cached_address_country,
    },
  }));

  return {
    totalCheckins: totalCheckinsResult.rows[0]?.count || 0,
    uniqueUsers: uniqueUsersResult.rows[0]?.count || 0,
    recentCheckins,
  };
}

// OAuth session queries
export async function getSessionBySessionId(sessionId: string) {
  const result = await db.execute(
    "SELECT * FROM oauth_sessions WHERE session_id = ?",
    [sessionId],
  );
  return result.rows[0] || null;
}

export async function deleteOAuthSession(did: string) {
  await db.execute("DELETE FROM oauth_sessions WHERE did = ?", [did]);
}

export async function getAllCheckinDids(): Promise<string[]> {
  const result = await db.execute(
    "SELECT DISTINCT did FROM checkins ORDER BY did",
    [],
  );
  return result.rows?.map((row) => row.did as string) || [];
}
