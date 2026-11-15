import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { ProviderTokens } from "./auth.types.js";

interface OidcConfig {
  issuer: string;
  clientId: string;
  oidcScope?: string;
}

const OidcMetadataSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  revocation_endpoint: z.string().url().optional(),
  userinfo_endpoint: z.string().url().optional(),
}).passthrough();

const OidcTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  id_token: z.string().min(1).optional(),
}).passthrough();

const OidcUserInfoSchema = z.object({
  email: z.string().optional(),
  name: z.string().optional(),
}).passthrough();

type OidcMetadata = z.infer<typeof OidcMetadataSchema>;

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
    private readonly timeoutMs = 10_000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("OIDC timeout must be a positive integer");
    }
  }

  async getAuthorizationUrl(input: AuthorizationUrlInput): Promise<string> {
    const metadata = await this.metadata();
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      scope: this.config.oidcScope ?? "openid",
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
    const response = await this.fetchWithTimeout(metadata.token_endpoint, {
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
    const body = await this.jsonOrThrow(
      response,
      "Authorization code exchange failed",
      OidcTokenResponseSchema,
    );
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? this.requiredString(undefined, "refresh_token"),
      accessTokenExpiresAt: this.expiresAt(body.expires_in),
      idToken: body.id_token ?? this.requiredString(undefined, "id_token"),
    };
  }

  async refresh(refreshToken: string): Promise<ProviderTokens> {
    const metadata = await this.metadata();
    const response = await this.fetchWithTimeout(metadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
      }),
    });
    const body = await this.jsonOrThrow(
      response,
      "Refresh token exchange failed",
      OidcTokenResponseSchema,
    );
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      accessTokenExpiresAt: this.expiresAt(body.expires_in),
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    const metadata = await this.metadata();
    if (!metadata.revocation_endpoint) return;
    const response = await this.fetchWithTimeout(metadata.revocation_endpoint, {
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
    const response = await this.fetchWithTimeout(metadata.userinfo_endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await this.jsonOrThrow(
      response,
      "User info request failed",
      OidcUserInfoSchema,
    );
    return {
      email: body.email,
      name: body.name,
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
    const response = await this.fetchWithTimeout(
      `${this.config.issuer}/.well-known/openid-configuration`,
    );
    return this.jsonOrThrow(response, "OIDC discovery failed", OidcMetadataSchema);
  }

  private async keySet(): Promise<JWTVerifyGetKey> {
    if (!this.jwks) {
      const metadata = await this.metadata();
      this.jwks = createRemoteJWKSet(new URL(metadata.jwks_uri), {
        [customFetch]: (input, init) => this.fetchWithTimeout(input, init),
      });
    }
    return this.jwks;
  }

  private async jsonOrThrow<T>(
    response: Response,
    message: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    if (!response.ok) throw new Error(message);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error(message);
    return parsed.data;
  }

  private async fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    try {
      return await this.fetchImpl(input, { ...init, signal });
    } finally {
      clearTimeout(timeout);
    }
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
