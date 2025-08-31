// Query functions using Drizzle ORM for type safety
import { db } from "./db.ts";
import {
  checkinsTable,
  oauthSessionsTable,
  profileCacheTable,
} from "./schema.ts";
import { count, desc, eq, sql } from "https://esm.sh/drizzle-orm";
import { ATProtocolProfileResolver } from "../utils/profile-resolver.ts";
import { DrizzleStorageProvider } from "../utils/storage-provider.ts";
// OAuth types now managed by Iron Session
interface OAuthSession {
  did: string;
  handle: string;
  pdsUrl: string;
  accessToken: string;
  refreshToken: string;
  dpopPrivateKey?: string;
  dpopPublicKey?: string;
  tokenExpiresAt?: number;
}

// Profile queries
export async function getProfileByDid(did: string) {
  const result = await db.select().from(profileCacheTable)
    .where(eq(profileCacheTable.did, did))
    .limit(1);
  return result[0] || null;
}

export async function upsertProfile(profile: {
  did: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}) {
  const now = new Date().toISOString();
  await db.insert(profileCacheTable)
    .values({
      did: profile.did,
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      indexedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profileCacheTable.did,
      set: {
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        updatedAt: now,
      },
    });
}

// Removed getRecentCheckins function - was only used by duplicate /api/feed endpoint

export async function insertCheckin(checkin: {
  id: string;
  uri: string;
  did: string;
  text: string;
  latitude?: number;
  longitude?: number;
  venue_name?: string;
  address_street?: string;
  address_locality?: string;
  address_region?: string;
  address_country?: string;
  address_postal_code?: string;
  created_at: string;
}) {
  const now = new Date().toISOString();

  // Extract rkey from URI
  const rkey = checkin.uri.split("/").pop() || checkin.id;

  await db.insert(checkinsTable)
    .values({
      id: checkin.id,
      uri: checkin.uri,
      rkey,
      did: checkin.did,
      text: checkin.text,
      latitude: checkin.latitude,
      longitude: checkin.longitude,
      venueName: checkin.venue_name,
      addressStreet: checkin.address_street,
      addressLocality: checkin.address_locality,
      addressRegion: checkin.address_region,
      addressCountry: checkin.address_country,
      addressPostalCode: checkin.address_postal_code,
      createdAt: checkin.created_at,
      indexedAt: now,
    });
}

// Shared statistics queries to eliminate duplication
export async function getCheckinCounts() {
  const [totalCheckinsResult, uniqueUsersResult] = await Promise.all([
    db.select({ count: count() }).from(checkinsTable),
    db.select({ count: sql<number>`count(distinct ${checkinsTable.did})` })
      .from(checkinsTable),
  ]);

  return {
    totalCheckins: totalCheckinsResult[0]?.count || 0,
    uniqueUsers: uniqueUsersResult[0]?.count || 0,
  };
}

export async function getRecentActivity() {
  const result = await db.select({ count: count() })
    .from(checkinsTable)
    .where(sql`${checkinsTable.createdAt} > datetime('now', '-24 hours')`);
  return result[0]?.count || 0;
}

// Dashboard stats using Drizzle for type safety
export async function getDashboardStats() {
  const counts = await getCheckinCounts();

  // Use Drizzle query for recent checkins with type safety
  const rows = await db.select({
    id: checkinsTable.id,
    uri: checkinsTable.uri,
    did: checkinsTable.did,
    text: checkinsTable.text,
    createdAt: checkinsTable.createdAt,
    venueName: checkinsTable.venueName,
    addressLocality: checkinsTable.addressLocality,
    addressRegion: checkinsTable.addressRegion,
    addressCountry: checkinsTable.addressCountry,
  }).from(checkinsTable)
    .orderBy(desc(checkinsTable.createdAt))
    .limit(20);

  // Get all unique DIDs for profile resolution
  const dids = [...new Set(rows.map((row) => row.did))];
  const storage = new DrizzleStorageProvider(db);
  const profileResolver = new ATProtocolProfileResolver(storage);
  const profiles = await profileResolver.batchResolveProfiles(dids);

  const recentCheckins = rows.map((row) => {
    const profile = profiles.get(row.did);
    return {
      id: row.id,
      uri: row.uri,
      author: {
        did: row.did,
        handle: profile?.handle || row.did,
        displayName: profile?.displayName,
      },
      text: row.text,
      createdAt: row.createdAt,
      address: {
        name: row.venueName,
        locality: row.addressLocality,
        region: row.addressRegion,
        country: row.addressCountry,
      },
    };
  });

  return {
    totalCheckins: counts.totalCheckins,
    uniqueUsers: counts.uniqueUsers,
    recentCheckins,
  };
}

// OAuth session queries
export async function getSessionBySessionId(
  sessionId: string,
): Promise<OAuthSession | null> {
  const result = await db.select().from(oauthSessionsTable)
    .where(eq(oauthSessionsTable.sessionId, sessionId))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  // Map database row to OAuthSession type
  return {
    did: row.did,
    handle: row.handle,
    pdsUrl: row.pdsUrl,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    dpopPrivateKey: row.dpopPrivateKey,
    dpopPublicKey: row.dpopPublicKey,
    tokenExpiresAt: row.tokenExpiresAt || 0,
  };
}

export async function deleteOAuthSession(did: string) {
  await db.delete(oauthSessionsTable)
    .where(eq(oauthSessionsTable.did, did));
}

export async function getAllCheckinDids(): Promise<string[]> {
  const result = await db.selectDistinct({ did: checkinsTable.did })
    .from(checkinsTable)
    .orderBy(checkinsTable.did);
  return result.map((row) => row.did);
}
