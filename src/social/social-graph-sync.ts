// @val-town socialGraphSync
// Daily cron job to sync follow relationships from Bluesky API
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

export default async function() {
  const startTime = Date.now();
  let syncedUsers = 0;
  let errors = 0;
  
  console.log('Starting social graph sync...');
  
  try {
    // Initialize tables
    await initializeTables();
    
    // Get active users (made checkins in last 30 days)
    const activeUsers = await sqlite.execute(`
      SELECT DISTINCT author_did, author_handle FROM checkins_v1 
      WHERE created_at > datetime('now', '-30 days')
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${activeUsers.length} active users to sync`);
    
    for (const user of activeUsers) {
      try {
        await syncUserFollows(user.author_did as string);
        syncedUsers++;
        
        // Rate limit: 1 second between users to respect API limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Log progress every 10 users
        if (syncedUsers % 10 === 0) {
          console.log(`Synced ${syncedUsers}/${activeUsers.length} users`);
        }
        
      } catch (error) {
        console.error(`Failed to sync follows for ${user.author_did}:`, error);
        errors++;
        
        // Continue with other users even if one fails
        continue;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`Social graph sync completed: ${syncedUsers} users synced, ${errors} errors, ${duration}ms`);
    
    return new Response(JSON.stringify({
      success: true,
      syncedUsers,
      totalActiveUsers: activeUsers.length,
      errors,
      duration_ms: duration
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Social graph sync error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      syncedUsers,
      errors: errors + 1,
      duration_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function initializeTables() {
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS user_follows_v1 (
      follower_did TEXT NOT NULL,
      following_did TEXT NOT NULL,
      created_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_did, following_did)
    )
  `);
  
  await sqlite.execute(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows_v1(follower_did)`);
}

async function syncUserFollows(userDid: string) {
  console.log(`Syncing follows for user: ${userDid}`);
  
  try {
    // Get follows from Bluesky public API
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${userDid}&limit=100`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Anchor-AppView/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`User not found: ${userDid}`);
        return;
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.follows || data.follows.length === 0) {
      console.log(`No follows found for user: ${userDid}`);
      return;
    }
    
    // Replace follows for this user (delete old, insert new)
    await sqlite.execute(`DELETE FROM user_follows_v1 WHERE follower_did = ?`, [userDid]);
    
    let insertedCount = 0;
    for (const follow of data.follows) {
      if (follow.did) {
        await sqlite.execute(`
          INSERT OR IGNORE INTO user_follows_v1 (follower_did, following_did, created_at)
          VALUES (?, ?, ?)
        `, [userDid, follow.did, follow.createdAt || new Date().toISOString()]);
        insertedCount++;
      }
    }
    
    console.log(`Synced ${insertedCount} follows for user: ${userDid}`);
    
    // Handle pagination if there are more follows
    if (data.cursor && data.follows.length >= 100) {
      await syncUserFollowsPaginated(userDid, data.cursor);
    }
    
  } catch (error) {
    console.error(`Error syncing follows for ${userDid}:`, error);
    throw error;
  }
}

async function syncUserFollowsPaginated(userDid: string, cursor: string) {
  try {
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${userDid}&cursor=${cursor}&limit=100`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Anchor-AppView/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.follows || data.follows.length === 0) {
      return;
    }
    
    let insertedCount = 0;
    for (const follow of data.follows) {
      if (follow.did) {
        await sqlite.execute(`
          INSERT OR IGNORE INTO user_follows_v1 (follower_did, following_did, created_at)
          VALUES (?, ?, ?)
        `, [userDid, follow.did, follow.createdAt || new Date().toISOString()]);
        insertedCount++;
      }
    }
    
    console.log(`Synced additional ${insertedCount} follows for user: ${userDid}`);
    
    // Continue pagination if there are more follows
    if (data.cursor && data.follows.length >= 100) {
      // Add delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      await syncUserFollowsPaginated(userDid, data.cursor);
    }
    
  } catch (error) {
    console.error(`Error syncing paginated follows for ${userDid}:`, error);
    throw error;
  }
}

// Utility function to get follow stats
export async function getFollowStats() {
  const results = await sqlite.execute(`
    SELECT 
      COUNT(*) as total_follows,
      COUNT(DISTINCT follower_did) as total_followers,
      COUNT(DISTINCT following_did) as total_following
    FROM user_follows_v1
  `);
  
  const recentSync = await sqlite.execute(`
    SELECT COUNT(DISTINCT follower_did) as recent_syncs
    FROM user_follows_v1
    WHERE synced_at > datetime('now', '-1 day')
  `);
  
  return {
    totalFollows: results[0]?.total_follows || 0,
    totalFollowers: results[0]?.total_followers || 0,
    totalFollowing: results[0]?.total_following || 0,
    recentSyncs: recentSync[0]?.recent_syncs || 0
  };
}