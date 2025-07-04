// Alternative address caching using Val Town's blob storage
// More efficient for key-value lookups than SQLite
import { blob } from "https://esm.town/v/std/blob";

interface CachedAddress {
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  resolvedAt: string;
  failedAt?: string;
}

const CACHE_PREFIX = "address_cache_";
const CACHE_EXPIRY_DAYS = 30;

export async function getCachedAddress(uri: string): Promise<CachedAddress | null> {
  const cacheKey = `${CACHE_PREFIX}${encodeURIComponent(uri)}`;
  const cached = await blob.getJSON(cacheKey) as CachedAddress | null;
  
  if (!cached) return null;
  
  // Check if cache is expired
  const cacheAge = Date.now() - new Date(cached.resolvedAt || cached.failedAt || cached.resolvedAt).getTime();
  const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  
  if (cacheAge > maxAge) {
    await blob.delete(cacheKey);
    return null;
  }
  
  return cached;
}

export async function setCachedAddress(uri: string, addressData: any): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${encodeURIComponent(uri)}`;
  const cached: CachedAddress = {
    name: addressData?.name,
    street: addressData?.street,
    locality: addressData?.locality,
    region: addressData?.region,
    country: addressData?.country,
    postalCode: addressData?.postalCode,
    latitude: addressData?.latitude,
    longitude: addressData?.longitude,
    resolvedAt: new Date().toISOString()
  };
  
  await blob.setJSON(cacheKey, cached);
}

export async function setCachedAddressFailure(uri: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${encodeURIComponent(uri)}`;
  const cached: CachedAddress = {
    resolvedAt: new Date().toISOString(), // For expiry calculation
    failedAt: new Date().toISOString()
  };
  
  await blob.setJSON(cacheKey, cached);
}

export async function getCacheStats(): Promise<{totalCached: number, failedCount: number}> {
  const keys = await blob.list(CACHE_PREFIX);
  let failedCount = 0;
  
  for (const keyInfo of keys) {
    const cached = await blob.getJSON(keyInfo.key) as CachedAddress | null;
    if (cached?.failedAt) failedCount++;
  }
  
  return {
    totalCached: keys.length,
    failedCount
  };
}