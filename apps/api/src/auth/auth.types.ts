export interface AuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  allowedOrigin: string;
  sessionSecret: Buffer;
  cookieName: string;
  cookieSecure: boolean;
  sessionIdleTtlMs: number;
  sessionAbsoluteTtlMs: number;
  loginStateTtlMs: number;
}

export interface ExternalIdentity {
  issuer: string;
  subject: string;
}

export interface AuthenticatedUser extends ExternalIdentity {
  id: string;
  displayName: string;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

export interface LoginTransaction {
  stateHash: string;
  nonce: string;
  codeVerifier: EncryptedSecret;
  redirectUri: string;
  expiresAt: Date;
}

export interface AuthSession {
  sessionHash: string;
  userId: string;
  providerTokens: ProviderTokens;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}
