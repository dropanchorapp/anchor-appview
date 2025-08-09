// Address resolution utilities for AT Protocol strongrefs
// Resolves venue/address records and manages caching
import { db } from "../database/db.ts";

export async function resolveAndCacheAddress(
  checkinId: string,
  addressRef: { uri: string; cid?: string },
) {
  try {
    // Check cache first
    const cached = await db.execute(
      `
      SELECT * FROM address_cache_v1 
      WHERE uri = ? AND failed_at IS NULL
    `,
      [addressRef.uri],
    );

    let addressData;
    if (cached.rows.length > 0) {
      addressData = JSON.parse(cached.rows[0].full_data as string);
      console.log("Using cached address data for:", addressRef.uri);
    } else {
      // Resolve address from AT Protocol network
      console.log("Resolving address from network:", addressRef.uri);
      addressData = await resolveAddressRecord(addressRef.uri);

      if (addressData) {
        // Cache the resolved address
        await db.execute(
          `
          INSERT OR REPLACE INTO address_cache_v1 
          (uri, cid, name, street, locality, region, country, postal_code, latitude, longitude, full_data, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            addressRef.uri,
            addressRef.cid || null,
            addressData.name || null,
            addressData.street || null,
            addressData.locality || null,
            addressData.region || null,
            addressData.country || null,
            addressData.postalCode || null,
            addressData.latitude || null,
            addressData.longitude || null,
            JSON.stringify(addressData),
            new Date().toISOString(),
          ],
        );

        console.log("Address cached successfully:", addressRef.uri);
      } else {
        // Mark as failed
        await db.execute(
          `
          INSERT OR REPLACE INTO address_cache_v1 (uri, failed_at) 
          VALUES (?, ?)
        `,
          [addressRef.uri, new Date().toISOString()],
        );

        console.log(
          "Address resolution failed, marked as failed:",
          addressRef.uri,
        );
      }
    }

    // Update checkin with resolved address data
    if (addressData) {
      await db.execute(
        `
        UPDATE checkins_v1 SET 
          cached_address_name = ?, 
          cached_address_street = ?, 
          cached_address_locality = ?,
          cached_address_region = ?, 
          cached_address_country = ?, 
          cached_address_postal_code = ?,
          cached_address_full = ?, 
          address_resolved_at = ?
        WHERE id = ?
      `,
        [
          addressData.name || null,
          addressData.street || null,
          addressData.locality || null,
          addressData.region || null,
          addressData.country || null,
          addressData.postalCode || null,
          JSON.stringify(addressData),
          new Date().toISOString(),
          checkinId,
        ],
      );

      console.log("Checkin updated with address data:", checkinId);
    }
  } catch (error) {
    console.error("Address resolution failed:", error);

    // Mark as failed on error
    try {
      await db.execute(
        `
        INSERT OR REPLACE INTO address_cache_v1 (uri, failed_at) 
        VALUES (?, ?)
      `,
        [addressRef.uri, new Date().toISOString()],
      );
    } catch (cacheError) {
      console.error("Failed to mark address as failed:", cacheError);
    }
  }
}

async function resolveAddressRecord(uri: string): Promise<any> {
  try {
    // Parse AT URI: at://did:plc:venue-database/community.lexicon.location.address/cafe-de-plek
    const parts = uri.replace("at://", "").split("/");

    if (parts.length !== 3) {
      throw new Error(`Invalid AT URI format: ${uri}`);
    }

    const [did, collection, rkey] = parts;

    // Step 1: Resolve DID to PDS endpoint
    const pdsEndpoint = await resolveDIDToPDS(did);

    if (!pdsEndpoint) {
      throw new Error(`Could not resolve DID to PDS: ${did}`);
    }

    // Step 2: Call com.atproto.repo.getRecord on that PDS
    const recordUrl =
      `${pdsEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=${collection}&rkey=${rkey}`;

    const response = await fetch(recordUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Anchor-AppView/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Record fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Step 3: Verify CID if provided (optional but recommended)
    // TODO: Implement CID verification

    // Return the resolved address record
    return data.value;
  } catch (error) {
    console.error("Failed to resolve address record:", uri, error);
    return null;
  }
}

async function resolveDIDToPDS(did: string): Promise<string | null> {
  try {
    // For DID:PLC, use the PLC directory
    if (did.startsWith("did:plc:")) {
      const response = await fetch(`https://plc.directory/${did}`);

      if (!response.ok) {
        throw new Error(`PLC directory lookup failed: ${response.status}`);
      }

      const data = await response.json();

      // Look for the PDS service in the DID document
      for (const service of data.service || []) {
        if (service.id === "#atproto_pds" && service.serviceEndpoint) {
          return service.serviceEndpoint;
        }
      }

      throw new Error("No PDS service found in DID document");
    }

    // For other DID methods, implement as needed
    throw new Error(`Unsupported DID method: ${did}`);
  } catch (error) {
    console.error("Failed to resolve DID to PDS:", did, error);
    return null;
  }
}

export async function batchResolveAddresses(
  addressRefs: Array<
    { checkinId: string; addressRef: { uri: string; cid?: string } }
  >,
) {
  console.log(
    `Starting batch address resolution for ${addressRefs.length} addresses`,
  );

  let resolved = 0;
  let errors = 0;

  for (const { checkinId, addressRef } of addressRefs) {
    try {
      await resolveAndCacheAddress(checkinId, addressRef);
      resolved++;

      // Rate limiting: wait 500ms between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(
        `Failed to resolve address for checkin ${checkinId}:`,
        error,
      );
      errors++;
    }
  }

  console.log(
    `Batch resolution complete: ${resolved} resolved, ${errors} errors`,
  );
  return { resolved, errors };
}

export async function getUnresolvedAddresses(
  limit: number = 50,
): Promise<
  Array<{ checkinId: string; addressRef: { uri: string; cid?: string } }>
> {
  const results = await db.execute(
    `
    SELECT id, address_ref_uri, address_ref_cid 
    FROM checkins_v1 
    WHERE address_ref_uri IS NOT NULL 
    AND address_resolved_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `,
    [limit],
  );

  // Ensure results is an array before mapping
  const resultArray = Array.isArray(results) ? results : [];

  return resultArray.map((row) => ({
    checkinId: row.id as string,
    addressRef: {
      uri: row.address_ref_uri as string,
      cid: row.address_ref_cid as string | undefined,
    },
  }));
}
