// Custom OAuth client that bypasses AT Protocol DPoP generation issues
// Uses standard OAuth flow + our working DPoP implementation

import { isValidHandle } from "npm:@atproto/syntax@0.4.0";
import {
  generateDPoPKeyPair,
  generateDPoPProof,
  makeDPoPRequest,
} from "./custom-dpop.ts";
import type { ValTownStorage } from "./iron-storage.ts";
import {
  discoverOAuthEndpointsFromPDS,
  resolveHandleWithSlingshot,
} from "./slingshot-resolver.ts";

const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app")
  .replace(/\/$/, "");

interface OAuthSession {
  did: string;
  handle: string;
  pdsUrl: string;
  accessToken: string;
  refreshToken: string;
  dpopPrivateKeyJWK: any;
  dpopPublicKeyJWK: any;
  tokenExpiresAt: number;
}

export class CustomOAuthClient {
  private storage: ValTownStorage;
  private clientId: string;
  private redirectUri: string;

  constructor(storage: ValTownStorage) {
    this.storage = storage;
    this.clientId = `${BASE_URL}/client-metadata.json`;
    this.redirectUri = `${BASE_URL}/oauth/callback`;
  }

  // Step 1: Get authorization URL
  async getAuthorizationUrl(handle: string, state?: string): Promise<string> {
    if (!isValidHandle(handle)) {
      throw new Error("Invalid handle");
    }

    // Resolve handle to get user's PDS and DID
    console.log(`Resolving handle: ${handle}`);
    const resolved = await resolveHandleWithSlingshot(handle);
    console.log(`Resolved PDS: ${resolved.pds} for DID: ${resolved.did}`);

    // Discover OAuth endpoints from the PDS
    console.log(`Discovering OAuth endpoints for PDS: ${resolved.pds}`);
    const oauthEndpoints = await discoverOAuthEndpointsFromPDS(resolved.pds);
    const authServer = oauthEndpoints.authorizationEndpoint.replace(
      /\/oauth\/authorize$/,
      "",
    );
    console.log(`Discovered OAuth server: ${authServer}`);

    // Generate PKCE
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store PKCE verifier and PDS info
    await this.storage.set(`pkce:${state || handle}`, {
      codeVerifier,
      authServer,
      handle,
      did: resolved.did,
      pdsUrl: resolved.pds,
    }, { ttl: 600 }); // 10 minutes

    // Step 1: Pushed Authorization Request (PAR) - required by bsky.social
    const parParams = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: "atproto transition:generic",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: state || "",
      // Include handle for context (not required but helpful)
      login_hint: handle,
    });

    console.log(`Pushing authorization request to ${authServer}/oauth/par`);
    const parResponse = await fetch(`${authServer}/oauth/par`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parParams,
    });

    if (!parResponse.ok) {
      const error = await parResponse.text();
      console.error(`PAR failed: ${parResponse.status} ${error}`);
      throw new Error(`Pushed Authorization Request failed: ${error}`);
    }

    const parResult = await parResponse.json();
    console.log(`PAR response:`, parResult);

    // Step 2: Build authorization URL with request_uri from PAR
    const authParams = new URLSearchParams({
      client_id: this.clientId,
      request_uri: parResult.request_uri,
    });

    const authUrl = `${authServer}/oauth/authorize?${authParams}`;
    console.log(`Generated authorization URL: ${authUrl}`);

    return authUrl;
  }

  // Step 2: Handle callback and get tokens
  async handleCallback(params: URLSearchParams): Promise<OAuthSession> {
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      throw new Error("Missing authorization code");
    }

    // Get stored PKCE data
    const pkceData = await this.storage.get(`pkce:${state || ""}`);
    if (!pkceData) {
      throw new Error("Invalid state or expired session");
    }

    // Generate DPoP keys first (needed for token exchange)
    const dpopKeys = await generateDPoPKeyPair();

    // Create DPoP proof for token exchange
    const tokenUrl = `${pkceData.authServer}/oauth/token`;
    const dpopProof = await generateDPoPProof(
      "POST",
      tokenUrl,
      dpopKeys.privateKey,
      dpopKeys.publicKeyJWK,
    );

    // Exchange code for tokens with DPoP proof
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: pkceData.codeVerifier,
    });

    let tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP": dpopProof,
      },
      body: tokenBody,
    });

    // Handle DPoP nonce requirement
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      // If server requires nonce, retry with nonce
      if (errorData.error === "use_dpop_nonce") {
        const nonce = tokenResponse.headers.get("dpop-nonce");
        if (!nonce) {
          throw new Error("Server requires DPoP nonce but didn't provide one");
        }

        console.log(`Retrying token exchange with DPoP nonce: ${nonce}`);

        // Generate new DPoP proof with nonce
        const dpopProofWithNonce = await generateDPoPProof(
          "POST",
          tokenUrl,
          dpopKeys.privateKey,
          dpopKeys.publicKeyJWK,
          undefined, // no access token yet
          nonce,
        );

        // Retry the token request with nonce
        tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "DPoP": dpopProofWithNonce,
          },
          body: tokenBody,
        });
      }

      // Check if retry was successful
      if (!tokenResponse.ok) {
        const retryError = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${retryError}`);
      }
    }

    const tokens = await tokenResponse.json();

    // Create session with DPoP keys
    const session: OAuthSession = {
      did: pkceData.did,
      handle: pkceData.handle,
      pdsUrl: pkceData.pdsUrl, // User's actual PDS, not the auth server
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      dpopPrivateKeyJWK: dpopKeys.privateKeyJWK,
      dpopPublicKeyJWK: dpopKeys.publicKeyJWK,
      tokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
    };

    // Clean up PKCE data
    await this.storage.del(`pkce:${state || ""}`);

    return session;
  }

  // Make authenticated DPoP request
  async makeAuthenticatedRequest(
    method: string,
    url: string,
    session: OAuthSession,
    body?: string,
  ): Promise<Response> {
    // Import private key from JWK
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      session.dpopPrivateKeyJWK,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["sign"],
    );

    return await makeDPoPRequest(
      method,
      url,
      session.accessToken,
      privateKey,
      session.dpopPublicKeyJWK,
      body,
    );
  }

  // Refresh access token using refresh token
  async refreshAccessToken(session: OAuthSession): Promise<OAuthSession> {
    // Discover OAuth endpoints from the user's PDS
    const oauthEndpoints = await discoverOAuthEndpointsFromPDS(session.pdsUrl);
    const tokenUrl = oauthEndpoints.tokenEndpoint;

    // Prepare refresh token request
    const tokenRequest = {
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      client_id: this.clientId,
    };

    // Create DPoP proof for the refresh request
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      session.dpopPrivateKeyJWK,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["sign"],
    );

    const dpopProof = await generateDPoPProof(
      "POST",
      tokenUrl,
      privateKey,
      session.dpopPublicKeyJWK,
    );

    // Make refresh token request
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP": dpopProof,
      },
      body: new URLSearchParams(tokenRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json();

    // Return updated session with new tokens
    const updatedSession: OAuthSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || session.refreshToken, // Some servers don't rotate refresh tokens
      tokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
    };

    return updatedSession;
  }

  // Helper: Generate PKCE code verifier
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
      .replace(/=/g, "");
  }

  // Helper: Generate PKCE code challenge
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
      .replace(/=/g, "");
  }
}
