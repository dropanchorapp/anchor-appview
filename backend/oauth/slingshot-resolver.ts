// Simplified OAuth handle resolution using Slingshot API

export interface SlingshotIdentityData {
  did: string;
  handle: string;
  pds: string;
  signing_key: string;
}

export interface OAuthEndpoints {
  pdsEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

/**
 * Resolve handle or DID to identity data using Slingshot's resolveMiniDoc endpoint
 * This replaces the complex multi-step resolution process with a single API call
 * @param identifier - Either a handle (e.g., "user.bsky.social") or DID (e.g., "did:plc:abc123")
 */
export async function resolveIdentifierWithSlingshot(
  identifier: string,
): Promise<SlingshotIdentityData> {
  // Check if this is a DID or handle and normalize accordingly
  let normalizedIdentifier: string;
  const isDID = identifier.startsWith("did:");

  if (isDID) {
    normalizedIdentifier = identifier.trim();
    console.log(`🚀 Resolving DID with Slingshot: ${normalizedIdentifier}`);
  } else {
    // Normalize handle by removing invisible Unicode characters and trimming
    normalizedIdentifier = identifier
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[^\w.-]/g, "")
      .trim()
      .toLowerCase();
    console.log(`🚀 Resolving handle with Slingshot: ${normalizedIdentifier}`);
  }

  try {
    const response = await fetch(
      `https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${
        encodeURIComponent(normalizedIdentifier)
      }`,
    );

    if (!response.ok) {
      throw new Error(`Slingshot resolution failed: ${response.status}`);
    }

    const data = await response.json() as SlingshotIdentityData;

    console.log(
      `✅ Slingshot resolved ${normalizedIdentifier} to ${data.did} with PDS ${data.pds}`,
    );
    return data;
  } catch (error) {
    console.error("Slingshot resolution failed:", error);
    throw new Error(
      `Could not resolve ${
        isDID ? "DID" : "handle"
      } ${normalizedIdentifier} via Slingshot: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Resolve handle to identity data using Slingshot (backward compatibility)
 */
export async function resolveHandleWithSlingshot(
  handle: string,
): Promise<SlingshotIdentityData> {
  return await resolveIdentifierWithSlingshot(handle);
}

/**
 * Resolve DID to PDS URL using Slingshot - useful for admin/backfill operations
 */
export async function resolveDIDToPDS(did: string): Promise<string> {
  const identity = await resolveIdentifierWithSlingshot(did);
  return identity.pds;
}

/**
 * Discover OAuth endpoints for a PDS using the simplified Slingshot data
 * This still requires OAuth metadata discovery but eliminates DID resolution steps
 */
export async function discoverOAuthEndpointsFromPDS(
  pdsEndpoint: string,
): Promise<OAuthEndpoints> {
  console.log(`🔍 Discovering OAuth endpoints for PDS: ${pdsEndpoint}`);

  // Step 1: Get PDS resource metadata to discover authorization server
  let authorizationServerUrl: string;

  try {
    const resourceMetadataResponse = await fetch(
      `${pdsEndpoint}/.well-known/oauth-protected-resource`,
    );
    if (!resourceMetadataResponse.ok) {
      throw new Error(
        `PDS resource metadata fetch failed: ${resourceMetadataResponse.status}`,
      );
    }
    const resourceMetadata = await resourceMetadataResponse.json();
    const authorizationServers = resourceMetadata.authorization_servers;

    if (!authorizationServers || authorizationServers.length === 0) {
      throw new Error("No authorization servers found in PDS metadata");
    }

    authorizationServerUrl = authorizationServers[0]; // Use first authorization server
    console.log(`🔍 Found authorization server: ${authorizationServerUrl}`);
  } catch (error) {
    console.error("PDS resource metadata discovery failed:", error);
    throw new Error("Failed to discover authorization server");
  }

  // Step 2: Get OAuth endpoints from the authorization server
  let authorizationEndpoint: string;
  let tokenEndpoint: string;

  try {
    const metadataResponse = await fetch(
      `${authorizationServerUrl}/.well-known/oauth-authorization-server`,
    );
    if (!metadataResponse.ok) {
      throw new Error(
        `OAuth metadata fetch failed: ${metadataResponse.status}`,
      );
    }
    const metadata = await metadataResponse.json();
    authorizationEndpoint = metadata.authorization_endpoint;
    tokenEndpoint = metadata.token_endpoint;

    if (!authorizationEndpoint || !tokenEndpoint) {
      throw new Error("Missing OAuth endpoints in metadata");
    }

    console.log(`✅ OAuth endpoints discovered from ${authorizationServerUrl}`);
  } catch (error) {
    console.error("OAuth metadata discovery failed:", error);
    throw new Error("Failed to discover OAuth endpoints");
  }

  return {
    pdsEndpoint,
    authorizationEndpoint,
    tokenEndpoint,
  };
}

/**
 * Complete OAuth setup using Slingshot - single function to replace complex multi-step process
 * This reduces OAuth initiation from 5+ API calls to just 2
 */
export async function setupOAuthWithSlingshot(rawHandle: string) {
  // Single API call to get all identity data
  const identity = await resolveHandleWithSlingshot(rawHandle);

  // Single API call to get OAuth endpoints
  const endpoints = await discoverOAuthEndpointsFromPDS(identity.pds);

  return {
    handle: identity.handle,
    did: identity.did,
    pdsEndpoint: identity.pds,
    signingKey: identity.signing_key,
    authorizationEndpoint: endpoints.authorizationEndpoint,
    tokenEndpoint: endpoints.tokenEndpoint,
  };
}
