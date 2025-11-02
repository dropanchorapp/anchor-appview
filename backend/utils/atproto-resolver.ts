/**
 * AT Protocol resolution utilities
 * Handles PDS discovery, handle resolution, and profile fetching
 */

/**
 * Resolve DID to PDS URL
 */
export async function resolvePdsUrl(did: string): Promise<string | null> {
  try {
    // For bsky.social DIDs, use the main PDS
    if (did.includes("bsky.social")) {
      return "https://bsky.social";
    }

    // For other DIDs, resolve from DID document
    const didResponse = await fetch(`https://plc.directory/${did}`);
    if (!didResponse.ok) {
      throw new Error(`Failed to resolve DID: ${didResponse.status}`);
    }

    const didDoc = await didResponse.json();
    const pdsEndpoint = didDoc.service?.find((s: any) =>
      s.id === "#atproto_pds" && s.type === "AtprotoPersonalDataServer"
    );

    return pdsEndpoint?.serviceEndpoint || null;
  } catch (error) {
    console.error(`Failed to resolve PDS for DID ${did}:`, error);
    return null;
  }
}

/**
 * Resolve handle to DID
 * Tries Slingshot resolver first, falls back to bsky.social
 */
export async function resolveHandleToDid(
  handle: string,
): Promise<string | null> {
  try {
    // Normalize handle (remove @ if present)
    const normalizedHandle = handle.startsWith("@") ? handle.slice(1) : handle;

    // Try resolving via Slingshot resolver first
    try {
      const slingshotResponse = await fetch(
        `https://slingshot.microcosm.blue/api/v1/resolve-handle/${
          encodeURIComponent(normalizedHandle)
        }`,
      );
      if (slingshotResponse.ok) {
        const data = await slingshotResponse.json();
        if (data.did) {
          return data.did;
        }
      }
    } catch (slingshotError) {
      console.warn(
        "Slingshot resolver failed, falling back to bsky.social:",
        slingshotError,
      );
    }

    // Fallback to bsky.social resolver
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${normalizedHandle}`,
    );
    if (response.ok) {
      const data = await response.json();
      return data.did || null;
    }

    return null;
  } catch (error) {
    console.error("Failed to resolve handle to DID:", error);
    return null;
  }
}

/**
 * Resolve profile data from user's PDS
 * Returns handle, displayName, avatar, and description
 */
export async function resolveProfileFromPds(did: string): Promise<
  {
    handle?: string;
    displayName?: string;
    avatar?: string;
    description?: string;
  } | null
> {
  try {
    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return null;
    }

    // Fetch profile record from PDS
    const response = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.bsky.actor.profile&rkey=self`,
    );

    if (!response.ok) {
      return null;
    }

    const profileData = await response.json();
    const profile = profileData.value;

    // Also try to get the handle from the DID document
    let handle = did; // fallback to DID
    try {
      const didResponse = await fetch(`https://plc.directory/${did}`);
      if (didResponse.ok) {
        const didDoc = await didResponse.json();
        const handleAlias = didDoc.alsoKnownAs?.find((alias: string) =>
          alias.startsWith("at://")
        );
        if (handleAlias) {
          handle = handleAlias.replace("at://", "");
        }
      }
    } catch (error) {
      console.warn("Failed to resolve handle from DID:", error);
    }

    // Handle avatar blob reference
    let avatarUrl: string | undefined;
    if (profile?.avatar) {
      if (typeof profile.avatar === "string") {
        // Already a URL
        avatarUrl = profile.avatar;
      } else if (profile.avatar.ref && typeof profile.avatar.ref === "object") {
        // It's a blob reference - construct the URL
        const blobRef = profile.avatar.ref.$link || profile.avatar.ref;
        if (blobRef) {
          avatarUrl =
            `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${blobRef}`;
        }
      }
    }

    return {
      handle,
      displayName: profile?.displayName,
      avatar: avatarUrl,
      description: profile?.description,
    };
  } catch (error) {
    console.error("Failed to resolve profile:", error);
    return null;
  }
}
