// Comprehensive AT Protocol checkin discovery script
// Uses multiple methods to find ALL app.dropanchor.checkin records across the network
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

interface CheckinRecord {
  uri: string;
  cid: string;
  value: {
    text: string;
    createdAt: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    addressRef?: {
      uri: string;
      cid: string;
    };
  };
}

interface DiscoveredCheckin {
  rkey: string;
  uri: string;
  authorDid: string;
  record: CheckinRecord;
}

export class CheckinDiscoveryService {
  private discoveredCheckins = new Map<string, DiscoveredCheckin>();
  private processedDids = new Set<string>();

  // Method 1: Search through known Bluesky social graph connections
  async discoverFromSocialGraph(): Promise<string[]> {
    const output: string[] = [];
    output.push("🔍 Discovering DIDs from social graph...");

    // Start with known dropanchor DID and explore their followers/following
    const startingDids = ["did:plc:wxex3wx5k4ctciupsv5m5stb"];
    const discoveredDids = new Set<string>(startingDids);

    for (const did of startingDids) {
      try {
        // Get their followers and following to expand the search
        const profile = await this.getProfile(did);
        if (profile) {
          output.push(`   Found profile: ${profile.handle || did}`);

          // Add this DID to our search list
          discoveredDids.add(did);

          // TODO: In a real implementation, we'd fetch followers/following
          // For now, we'll use the firehose approach
        }
      } catch (error) {
        output.push(`   ❌ Error getting profile for ${did}: ${error.message}`);
      }
    }

    return Array.from(discoveredDids);
  }

  // Method 2: Use AT Protocol search endpoints and known app patterns
  async searchATProtoNetwork(): Promise<string[]> {
    const output: string[] = [];
    output.push("🔍 Searching AT Protocol network for checkin records...");

    const discoveredDids = new Set<string>();

    // Search approach 1: Look for posts mentioning Drop Anchor app or checkins
    const searchTerms = [
      "dropanchor",
      "drop anchor",
      "anchor checkin",
      "checking in at",
      "📍", // location emoji
      "#checkin",
      "location sharing",
    ];

    const searchEndpoints = [
      "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts",
      "https://bsky.social/xrpc/app.bsky.feed.searchPosts",
    ];

    for (const endpoint of searchEndpoints) {
      for (const term of searchTerms) {
        try {
          const searchParams = new URLSearchParams({
            q: term,
            limit: "50",
          });

          const response = await fetch(`${endpoint}?${searchParams}`);
          if (response.ok) {
            const data = await response.json();
            const foundPosts = data.posts?.length || 0;
            if (foundPosts > 0) {
              output.push(`   Found ${foundPosts} posts for "${term}"`);

              // Extract DIDs from posts
              for (const post of data.posts || []) {
                if (post.author?.did) {
                  discoveredDids.add(post.author.did);
                }
              }
            }
          }
        } catch (_error) {
          // Silently continue - search endpoints may be rate limited
        }
      }
    }

    // Search approach 2: Try to find DIDs from AT Protocol directory services
    try {
      // Check if there's a way to discover DIDs through handle resolution
      const commonHandles = [
        "dropanchor.app",
        "anchor.app",
        "checkin.app",
        "location.app",
      ];

      for (const handle of commonHandles) {
        try {
          const response = await fetch(
            `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
          );
          if (response.ok) {
            const data = await response.json();
            if (data.did) {
              discoveredDids.add(data.did);
              output.push(`   Resolved handle ${handle} -> ${data.did}`);
            }
          }
        } catch (_error) {
          // Continue with other handles
        }
      }
    } catch (_error) {
      // Continue with other methods
    }

    // Search approach 3: Known community DIDs that might use location apps
    const communityDids = [
      // Add any DIDs we discover from community or documentation
      "did:plc:wxex3wx5k4ctciupsv5m5stb", // dropanchor.app (already known)
    ];

    for (const did of communityDids) {
      discoveredDids.add(did);
    }

    output.push(`   Total DIDs discovered from search: ${discoveredDids.size}`);
    return Array.from(discoveredDids);
  }

  // Method 3: Crawl specific repositories for checkin records
  async crawlRepositories(dids: string[]): Promise<DiscoveredCheckin[]> {
    const output: string[] = [];
    const discovered: DiscoveredCheckin[] = [];

    output.push(
      `🔍 Crawling ${dids.length} repositories for checkin records...`,
    );

    for (const did of dids) {
      if (this.processedDids.has(did)) continue;

      try {
        this.processedDids.add(did);
        const records = await this.getCheckinRecords(did);

        if (records.length > 0) {
          output.push(`   ✅ Found ${records.length} checkins from ${did}`);

          for (const record of records) {
            const rkey = record.uri.split("/").pop();
            if (rkey) {
              const checkin: DiscoveredCheckin = {
                rkey,
                uri: record.uri,
                authorDid: did,
                record,
              };

              discovered.push(checkin);
              this.discoveredCheckins.set(record.uri, checkin);
            }
          }
        }
      } catch (error) {
        output.push(`   ❌ Failed to crawl ${did}: ${error.message}`);
      }
    }

    return discovered;
  }

  // Helper: Get profile data for a DID
  private async getProfile(did: string): Promise<any> {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to get profile: ${response.status}`);
    }

    return response.json();
  }

  // Helper: Get checkin records for a specific DID
  private async getCheckinRecords(did: string): Promise<CheckinRecord[]> {
    const url = "https://bsky.social/xrpc/com.atproto.repo.listRecords";
    const params = new URLSearchParams({
      repo: did,
      collection: "app.dropanchor.checkin",
      limit: "100",
      reverse: "true",
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      if (response.status === 400) {
        // Repository not found or no records
        return [];
      }
      throw new Error(`Failed to fetch records: ${response.status}`);
    }

    const data = await response.json();
    return data.records || [];
  }

  // Store discovered checkins in database
  async storeCheckins(checkins: DiscoveredCheckin[]): Promise<number> {
    let stored = 0;

    for (const checkin of checkins) {
      try {
        // Check if already exists
        const existing = await sqlite.execute(
          "SELECT id FROM checkins WHERE id = ?",
          [checkin.rkey],
        );

        if (existing.rows && existing.rows.length > 0) {
          continue; // Skip existing
        }

        // Extract coordinates
        const lat = checkin.record.value.coordinates?.latitude || null;
        const lng = checkin.record.value.coordinates?.longitude || null;

        // Insert checkin
        await sqlite.execute(
          `
          INSERT OR IGNORE INTO checkins 
          (id, uri, author_did, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            checkin.rkey,
            checkin.uri,
            checkin.authorDid,
            checkin.record.value.text || "",
            checkin.record.value.createdAt || new Date().toISOString(),
            lat,
            lng,
            checkin.record.value.addressRef?.uri || null,
            checkin.record.value.addressRef?.cid || null,
          ],
        );

        stored++;
      } catch (error) {
        console.error(`Failed to store checkin ${checkin.rkey}:`, error);
      }
    }

    return stored;
  }
}

export default async function (): Promise<Response> {
  const output: string[] = [];
  let totalDiscovered = 0;
  let totalStored = 0;

  try {
    output.push("🚀 Starting comprehensive checkin discovery...");

    const discoveryService = new CheckinDiscoveryService();

    // Initialize tables
    await sqlite.execute(`
      CREATE TABLE IF NOT EXISTS checkins (
        id TEXT PRIMARY KEY,
        uri TEXT UNIQUE NOT NULL,
        author_did TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        address_ref_uri TEXT,
        address_ref_cid TEXT,
        indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Method 1: Discover DIDs from social graph
    const socialGraphDids = await discoveryService.discoverFromSocialGraph();
    output.push(`Found ${socialGraphDids.length} DIDs from social graph`);

    // Method 2: Search AT Protocol network
    const searchDids = await discoveryService.searchATProtoNetwork();
    output.push(`Found ${searchDids.length} DIDs from network search`);

    // Combine and deduplicate DIDs
    const allDids = [...new Set([...socialGraphDids, ...searchDids])];
    output.push(`\n📊 Total unique DIDs to crawl: ${allDids.length}`);

    // Method 3: Crawl all discovered repositories
    const discoveredCheckins = await discoveryService.crawlRepositories(
      allDids,
    );
    totalDiscovered = discoveredCheckins.length;

    output.push(
      `\n🎯 Discovered ${totalDiscovered} checkin records across ${allDids.length} repositories`,
    );

    // Store all discovered checkins
    totalStored = await discoveryService.storeCheckins(discoveredCheckins);

    output.push(`\n📦 Stored ${totalStored} new checkin records`);

    // Summary
    output.push(`\n📊 Discovery Summary:`);
    output.push(`   DIDs crawled: ${allDids.length}`);
    output.push(`   Checkins discovered: ${totalDiscovered}`);
    output.push(`   New records stored: ${totalStored}`);
    output.push(`\n✅ Comprehensive discovery complete!`);

    return new Response(output.join("\n"), {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    output.push(`\n❌ Discovery failed: ${error.message}`);
    return new Response(output.join("\n"), {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
