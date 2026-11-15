import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "./auth.crypto.js";
import type { AuthRepository } from "./auth.repository.js";
import type { AccessTokenVerifier } from "./token-verifier.js";
import type { AuthConfig, AuthenticatedUser, AuthSession, ProviderTokens } from "./auth.types.js";
import type { OidcProvider } from "./oidc.client.js";

type AuthRepositoryPort = Pick<
  AuthRepository,
  | "createLoginTransaction"
  | "consumeLoginTransaction"
  | "findOrCreateUser"
  | "createSession"
  | "findSession"
  | "findUserById"
  | "touchSession"
  | "revokeSession"
>;

type TokenVerifierPort = Pick<AccessTokenVerifier, "verify">;

export interface LoginStart {
  redirectUrl: string;
  stateCookie: string;
}

export interface AuthServiceClock {
  (): Date;
}

export class AuthService {
  private readonly refreshes = new Map<string, Promise<ProviderTokens | null>>();

  constructor(
    private readonly config: AuthConfig,
    private readonly repository: AuthRepositoryPort,
    private readonly provider: OidcProvider,
    private readonly verifier: TokenVerifierPort,
    private readonly clock: AuthServiceClock = () => new Date(),
  ) {}

  async beginLogin(): Promise<LoginStart> {
    const state = randomToken(32);
    const nonce = randomToken(32);
    const codeVerifier = randomToken(32);
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const now = this.clock();
    await this.repository.createLoginTransaction({
      stateHash: hashToken(state),
      nonce,
      codeVerifier: encryptSecret(
        codeVerifier,
        this.config.sessionSecret,
      ),
      redirectUri: this.config.redirectUri,
      expiresAt: new Date(now.getTime() + this.config.loginStateTtlMs),
    });
    return {
      redirectUrl: await this.provider.getAuthorizationUrl({
        redirectUri: this.config.redirectUri,
        state,
        nonce,
        codeChallenge,
      }),
      stateCookie: state,
    };
  }

  async completeLogin(state: string, code: string): Promise<{
    sessionCookie: string;
    user: AuthenticatedUser;
  }> {
    const transaction = await this.repository.consumeLoginTransaction(hashToken(state));
    if (!transaction) throw new Error("Login state is invalid or expired");

    const codeVerifier = decryptSecret(
      transaction.codeVerifier,
      this.config.sessionSecret,
    );
    const exchanged = await this.provider.exchangeCode(
      code,
      transaction.redirectUri,
      codeVerifier,
    );
    await this.provider.validateIdTokenNonce(exchanged.idToken, transaction.nonce);
    const claims = await this.verifier.verify(exchanged.accessToken);
    const userInfo = await this.provider.getUserInfo(exchanged.accessToken);
    const user = await this.repository.findOrCreateUser(
      { issuer: claims.issuer, subject: claims.subject },
      userInfo.name || userInfo.email || claims.subject,
    );

    const now = this.clock();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.sessionAbsoluteTtlMs,
    );
    const sessionCookie = randomToken(32);
    const { idToken: _idToken, ...providerTokens } = exchanged;
    await this.repository.createSession({
      sessionHash: hashToken(sessionCookie),
      userId: user.id,
      providerTokens,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: this.idleExpiry(now, absoluteExpiresAt),
      absoluteExpiresAt,
      revokedAt: null,
    });
    return { sessionCookie, user };
  }

  async getSession(sessionCookie: string): Promise<AuthenticatedUser | null> {
    const sessionHash = hashToken(sessionCookie);
    const session = await this.repository.findSession(sessionHash);
    if (!session) return null;
    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      await this.repository.revokeSession(sessionHash);
      return null;
    }

    let providerTokens = session.providerTokens;
    if (providerTokens.accessTokenExpiresAt.getTime() <= this.clock().getTime()) {
      const refreshed = await this.refreshSession(sessionHash, session.providerTokens, user);
      if (!refreshed) return null;
      providerTokens = refreshed;
    }

    const now = this.clock();
    await this.repository.touchSession(
      sessionHash,
      providerTokens,
      now,
      this.idleExpiry(now, session.absoluteExpiresAt),
    );
    return user;
  }

  async logout(sessionCookie: string): Promise<string | null> {
    const sessionHash = hashToken(sessionCookie);
    const session = await this.repository.findSession(sessionHash);
    try {
      if (session) await this.provider.revoke(session.providerTokens.refreshToken);
    } catch {
      // Local revocation below is authoritative even when the provider is unavailable.
    } finally {
      await this.repository.revokeSession(sessionHash);
    }
    return this.buildProviderLogoutUrl();
  }

  private buildProviderLogoutUrl(): string | null {
    if (!this.config.providerLogoutUri) return null;
    const logoutUrl = new URL(this.config.providerLogoutUri);
    logoutUrl.searchParams.set("client_id", this.config.clientId);
    logoutUrl.searchParams.set("logout_uri", this.config.logoutUri);
    return logoutUrl.toString();
  }

  private refreshSession(
    sessionHash: string,
    currentTokens: ProviderTokens,
    user: AuthenticatedUser,
  ): Promise<ProviderTokens | null> {
    const pending = this.refreshes.get(sessionHash);
    if (pending) return pending;

    const refreshPromise = this.performRefresh(sessionHash, currentTokens, user);
    this.refreshes.set(sessionHash, refreshPromise);
    void refreshPromise.then(
      () => this.clearRefresh(sessionHash, refreshPromise),
      () => this.clearRefresh(sessionHash, refreshPromise),
    );
    return refreshPromise;
  }

  private async performRefresh(
    sessionHash: string,
    currentTokens: ProviderTokens,
    user: AuthenticatedUser,
  ): Promise<ProviderTokens | null> {
    try {
      const providerTokens = await this.provider.refresh(currentTokens.refreshToken);
      const claims = await this.verifier.verify(providerTokens.accessToken);
      if (claims.issuer !== user.issuer || claims.subject !== user.subject) {
        throw new Error("Refreshed token identity does not match session");
      }
      return providerTokens;
    } catch {
      await this.repository.revokeSession(sessionHash);
      return null;
    }
  }

  private clearRefresh(
    sessionHash: string,
    refreshPromise: Promise<ProviderTokens | null>,
  ): void {
    if (this.refreshes.get(sessionHash) === refreshPromise) {
      this.refreshes.delete(sessionHash);
    }
  }

  private idleExpiry(now: Date, absoluteExpiresAt: Date): Date {
    return new Date(
      Math.min(
        now.getTime() + this.config.sessionIdleTtlMs,
        absoluteExpiresAt.getTime(),
      ),
    );
  }
}
