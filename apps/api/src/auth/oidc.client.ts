import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import type { ProviderTokens } from "./auth.types.js";

interface OidcConfig {
  issuer: string;
  clientId: string;
}

interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
}

export interface AuthorizationUrlInput {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface OidcTokenResponse extends ProviderTokens {
  idToken: string;
}

export interface OidcUserInfo {
  email?: string;
  name?: string;
}

export interface OidcProvider {
  getAuthorizationUrl(input: AuthorizationUrlInput): Promise<string>;
  exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<OidcTokenResponse>;
  refresh(refreshToken: string): Promise<ProviderTokens>;
  revoke(refreshToken: string): Promise<void>;
  validateIdTokenNonce(idToken: string, nonce: string): Promise<void>;
  getUserInfo(accessToken: string): Promise<OidcUserInfo>;
}

type FetchLike = typeof fetch;

export class OidcClient implements OidcProvider {
  private metadataPromise: Promise<OidcMetadata> | undefined;
  private jwks: JWTVerifyGetKey | undefined;

  constructor(
    private readonly config: OidcConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getAuthorizationUrl(input: AuthorizationUrlInput): Promise<string> {
    const metadata = await this.metadata();
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      scope: "openid email",
      redirect_uri: input.redirectUri,
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<OidcTokenResponse> {
    const metadata = await this.metadata();
    const response = await this.fetchImpl(metadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.config.clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const body = await this.jsonOrThrow(response, "Authorization code exchange failed");
    return {
      accessToken: this.requiredString(body.access_token, "access_token"),
      refreshToken: this.requiredString(body.refresh_token, "refresh_token"),
      accessTokenExpiresAt: this.expiresAt(body.expires_in),
      idToken: this.requiredString(body.id_token, "id_token"),
    };
  }

  async refresh(refreshToken: string): Promise<ProviderTokens> {
    const metadata = await this.metadata();
    const response = await this.fetchImpl(metadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
      }),
    });
    const body = await this.jsonOrThrow(response, "Refresh token exchange failed");
    return {
      accessToken: this.requiredString(body.access_token, "access_token"),
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : refreshToken,
      accessTokenExpiresAt: this.expiresAt(body.expires_in),
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    const metadata = await this.metadata();
    if (!metadata.revocation_endpoint) return;
    const response = await this.fetchImpl(metadata.revocation_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: "refresh_token",
        client_id: this.config.clientId,
      }),
    });
    if (!response.ok) throw new Error("Provider token revoke failed");
  }

  async validateIdTokenNonce(idToken: string, nonce: string): Promise<void> {
    const result = await jwtVerify(idToken, await this.keySet(), {
      issuer: this.config.issuer,
      audience: this.config.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["nonce"],
    });
    if (result.payload.nonce !== nonce) throw new Error("OIDC nonce does not match");
  }

  async getUserInfo(accessToken: string): Promise<OidcUserInfo> {
    const metadata = await this.metadata();
    if (!metadata.userinfo_endpoint) return {};
    const response = await this.fetchImpl(metadata.userinfo_endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await this.jsonOrThrow(response, "User info request failed");
    return {
      email: typeof body.email === "string" ? body.email : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
    };
  }

  async createKeySet(): Promise<JWTVerifyGetKey> {
    return this.keySet();
  }

  private async metadata(): Promise<OidcMetadata> {
    this.metadataPromise ??= this.fetchMetadata();
    return this.metadataPromise;
  }

  private async fetchMetadata(): Promise<OidcMetadata> {
    const response = await this.fetchImpl(
      `${this.config.issuer}/.well-known/openid-configuration`,
    );
    const body = await this.jsonOrThrow(response, "OIDC discovery failed");
    for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) {
      if (typeof body[field] !== "string") throw new Error(`OIDC metadata is missing ${field}`);
    }
    return body as OidcMetadata;
  }

  private async keySet(): Promise<JWTVerifyGetKey> {
    if (!this.jwks) {
      const metadata = await this.metadata();
      this.jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
    }
    return this.jwks;
  }

  private async jsonOrThrow(response: Response, message: string): Promise<Record<string, any>> {
    if (!response.ok) throw new Error(message);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") throw new Error(message);
    return body as Record<string, any>;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`OIDC response is missing ${field}`);
    }
    return value;
  }

  private expiresAt(value: unknown): Date {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error("OIDC response has invalid expires_in");
    }
    return new Date(Date.now() + seconds * 1000);
  }
}
