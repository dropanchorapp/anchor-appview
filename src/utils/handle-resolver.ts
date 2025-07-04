// Handle resolution utilities for AT Protocol
// Resolves DIDs to human-readable handles for display

export async function resolveHandle(did: string): Promise<string> {
  // Use public Bluesky PDS for handle resolution
  const response = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${did}`);
  
  if (!response.ok) {
    // If direct resolution fails, try reverse lookup
    return await reverseResolveHandle(did);
  }
  
  const data = await response.json();
  return data.handle || did;
}

async function reverseResolveHandle(did: string): Promise<string> {
  // Use Bluesky's profile API to get handle from DID
  const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`);
  
  if (!response.ok) {
    // Return shortened DID as fallback for failed lookups
    return did.startsWith('did:plc:') ? did.substring(8, 16) : did;
  }
  
  const data = await response.json();
  return data.handle || did;
}

export async function batchResolveHandles(dids: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Rate limit: resolve handles in batches with delays
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < dids.length; i += batchSize) {
    batches.push(dids.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const promises = batch.map(async (did) => {
      const handle = await resolveHandle(did);
      results.set(did, handle);
    });
    
    await Promise.all(promises);
    
    // Rate limiting: wait 1 second between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}