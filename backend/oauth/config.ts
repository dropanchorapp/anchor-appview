// OAuth configuration for Anchor AppView
const BASE_URL = (Deno.env.get("ANCHOR_BASE_URL") ||
  "https://dropanchor.app").replace(/\/$/, ""); // Remove trailing slash

export const OAUTH_CONFIG = {
  CLIENT_ID: `${BASE_URL}/client-metadata.json`,
  APP_NAME: "Anchor Location Feed",
  BASE_URL,
  REDIRECT_URI: `${BASE_URL}/oauth/callback`,
  PLC_DIRECTORY: "https://plc.directory",
  ATPROTO_SERVICE: "https://bsky.social",
};

export interface OAuthSession {
  did: string;
  handle: string;
  pdsUrl: string;
  accessToken: string;
  refreshToken: string;
  dpopPrivateKey: string; // JWK format
  dpopPublicKey: string; // JWK format
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export interface OAuthStateData {
  codeVerifier: string;
  handle: string;
  did: string;
  pdsEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  timestamp: number;
}
