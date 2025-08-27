// Custom DPoP implementation for Val.town/Deno compatible with AT Protocol
// Uses Web Crypto API directly instead of problematic Node.js crypto

import { exportJWK, SignJWT } from "https://esm.sh/jose@5.2.0";

// Generate ES256 key pair for DPoP
export async function generateDPoPKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true, // extractable
    ["sign", "verify"],
  );

  // Export public key as JWK for DPoP header
  const publicKeyJWK = await exportJWK(keyPair.publicKey);

  // Export private key as JWK for storage
  const privateKeyJWK = await exportJWK(keyPair.privateKey);

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    privateKeyJWK,
    publicKeyJWK,
  };
}

// Generate DPoP proof JWT using Web Crypto API
export async function generateDPoPProof(
  method: string,
  url: string,
  privateKey: CryptoKey,
  publicKeyJWK: any,
  accessToken?: string,
  nonce?: string,
): Promise<string> {
  // Create DPoP JWT payload
  const payload: any = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (5 * 60), // Expires in 5 minutes
  };

  if (accessToken) {
    // Hash access token for ath claim
    const encoder = new TextEncoder();
    const data = encoder.encode(accessToken);
    const digest = await crypto.subtle.digest("SHA-256", data);
    payload.ath = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
      .replace(/=/g, "");
  }

  if (nonce) {
    payload.nonce = nonce;
  }

  // Sign JWT using Web Crypto
  const dpopProof = await new SignJWT(payload)
    .setProtectedHeader({
      typ: "dpop+jwt",
      alg: "ES256",
      jwk: publicKeyJWK,
    })
    .sign(privateKey);

  return dpopProof;
}

// Make authenticated DPoP request
export async function makeDPoPRequest(
  method: string,
  url: string,
  accessToken: string,
  privateKey: CryptoKey,
  publicKeyJWK: any,
  body?: string,
): Promise<Response> {
  // Generate initial DPoP proof
  let dpopProof = await generateDPoPProof(
    method,
    url,
    privateKey,
    publicKeyJWK,
    accessToken,
  );

  const headers: HeadersInit = {
    "Authorization": `DPoP ${accessToken}`,
    "DPoP": dpopProof,
    "Content-Type": "application/json",
  };

  let response = await fetch(url, {
    method,
    headers,
    body,
  });

  // Handle DPoP nonce challenge
  if (response.status === 401) {
    const dpopNonce = response.headers.get("DPoP-Nonce");
    if (dpopNonce) {
      console.log("🔄 Retrying DPoP request with nonce");

      // Generate new proof with nonce
      dpopProof = await generateDPoPProof(
        method,
        url,
        privateKey,
        publicKeyJWK,
        accessToken,
        dpopNonce,
      );

      headers["DPoP"] = dpopProof;
      response = await fetch(url, {
        method,
        headers,
        body,
      });
    }
  }

  return response;
}

// Import private key from JWK for DPoP operations
export async function importPrivateKeyFromJWK(
  privateKeyJWK: any,
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    privateKeyJWK,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false, // not extractable
    ["sign"],
  );
}
