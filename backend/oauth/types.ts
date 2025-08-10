// OAuth types for ATProto authentication

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
  isMobileApp?: boolean;
}

export interface DPoPProofParams {
  method: string;
  url: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  accessToken?: string;
  nonce?: string;
}

export interface AuthServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  dpop_signing_alg_values_supported: string[];
}

export interface ResourceMetadata {
  resource: string;
  authorization_servers: string[];
}
