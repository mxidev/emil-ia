import { describe, expect, it, vi } from "vitest";
import { encryptSecret, hashToken } from "../../src/auth/auth.crypto.js";
import { AuthService } from "../../src/auth/auth.service.js";
import type { AuthConfig, AuthSession, ProviderTokens } from "../../src/auth/auth.types.js";

const config: AuthConfig = {
  issuer: "http://localhost:4566/pool-123",
  clientId: "client-123",
  redirectUri: "http://localhost:3000/api/auth/callback",
  logoutUri: "http://localhost:4200/",
  allowedOrigin: "http://localhost:4200",
  sessionSecret: Buffer.alloc(32, 8),
  cookieName: "emilia_session",
  cookieSecure: false,
  sessionIdleTtlMs: 7 * 24 * 60 * 60 * 1000,
  sessionAbsoluteTtlMs: 30 * 24 * 60 * 60 * 1000,
  loginStateTtlMs: 10 * 60 * 1000,
};

const now = new Date("2026-11-15T18:00:00.000Z");
const providerTokens: ProviderTokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: new Date("2026-11-15T18:05:00.000Z"),
};

function transaction() {
  return {
    stateHash: hashToken("state-token"),
    nonce: "nonce-value",
    codeVerifier: encryptSecret("code-verifier", config.sessionSecret),
    redirectUri: config.redirectUri,
    expiresAt: new Date("2026-11-15T18:10:00.000Z"),
  };
}

function repository() {
  return {
    createLoginTransaction: vi.fn(),
    consumeLoginTransaction: vi.fn(),
    findOrCreateUser: vi.fn(),
    createSession: vi.fn(),
    findSession: vi.fn(),
    findUserById: vi.fn(),
    touchSession: vi.fn(),
    revokeSession: vi.fn(),
  };
}

function provider() {
  return {
    getAuthorizationUrl: vi.fn(async () => "https://login.example/authorize"),
    exchangeCode: vi.fn(async () => ({
      ...providerTokens,
      idToken: "id-token",
    })),
    validateIdTokenNonce: vi.fn(async () => undefined),
    refresh: vi.fn(async () => providerTokens),
    revoke: vi.fn(async () => undefined),
    getUserInfo: vi.fn(async () => ({ email: "ada@example.com", name: "Ada Lovelace" })),
  };
}

describe("AuthService", () => {
  it("creates a one-time PKCE login transaction", async () => {
    const repo = repository();
    const oidc = provider();
    const service = new AuthService(config, repo, oidc, {
      verify: vi.fn(),
    }, () => now);

    const result = await service.beginLogin();

    expect(result.redirectUrl).toBe("https://login.example/authorize");
    expect(result.stateCookie).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(repo.createLoginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        stateHash: hashToken(result.stateCookie),
        redirectUri: config.redirectUri,
      }),
    );
    expect(oidc.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: config.redirectUri }),
    );
  });

  it("exchanges a valid callback and creates an opaque application session", async () => {
    const repo = repository();
    repo.consumeLoginTransaction.mockResolvedValue(transaction());
    repo.findOrCreateUser.mockResolvedValue({
      id: "user-123",
      displayName: "Ada Lovelace",
      issuer: config.issuer,
      subject: "subject-123",
    });
    const oidc = provider();
    const service = new AuthService(
      config,
      repo,
      oidc,
      {
        verify: vi.fn(async () => ({
          issuer: config.issuer,
          subject: "subject-123",
          clientId: config.clientId,
          tokenUse: "access" as const,
          expiresAt: Math.floor(now.getTime() / 1000) + 300,
        })),
      },
      () => now,
    );

    const result = await service.completeLogin("state-token", "authorization-code");

    expect(result.user.id).toBe("user-123");
    expect(result.sessionCookie).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        providerTokens,
        absoluteExpiresAt: new Date("2026-12-15T18:00:00.000Z"),
      }),
    );
    expect(oidc.validateIdTokenNonce).toHaveBeenCalledWith("id-token", "nonce-value");
  });

  it("rejects a callback when state was already consumed or expired", async () => {
    const repo = repository();
    repo.consumeLoginTransaction.mockResolvedValue(null);
    const service = new AuthService(config, repo, provider(), { verify: vi.fn() }, () => now);

    await expect(service.completeLogin("state-token", "code")).rejects.toThrow(
      /login state is invalid/i,
    );
  });

  it("refreshes an expired provider token and touches the idle session", async () => {
    const repo = repository();
    const session: AuthSession = {
      sessionHash: hashToken("session-token"),
      userId: "user-123",
      providerTokens: {
        ...providerTokens,
        accessTokenExpiresAt: new Date("2026-11-15T17:59:00.000Z"),
      },
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date("2026-11-22T18:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-12-15T18:00:00.000Z"),
      revokedAt: null,
    };
    repo.findSession.mockResolvedValue(session);
    repo.findUserById.mockResolvedValue({
      id: "user-123",
      displayName: "Ada Lovelace",
      issuer: config.issuer,
      subject: "subject-123",
    });
    const oidc = provider();
    const service = new AuthService(
      config,
      repo,
      oidc,
      {
        verify: vi.fn(async () => ({
          issuer: config.issuer,
          subject: "subject-123",
          clientId: config.clientId,
          tokenUse: "access" as const,
          expiresAt: Math.floor(now.getTime() / 1000) + 300,
        })),
      },
      () => now,
    );

    await expect(service.getSession("session-token")).resolves.toMatchObject({
      id: "user-123",
    });
    expect(oidc.refresh).toHaveBeenCalledWith("refresh-token");
    expect(repo.touchSession).toHaveBeenCalled();
  });

  it("revokes the local session even when provider revoke fails", async () => {
    const repo = repository();
    repo.findSession.mockResolvedValue({ providerTokens } as AuthSession);
    const oidc = provider();
    oidc.revoke.mockRejectedValue(new Error("provider unavailable"));
    const service = new AuthService(config, repo, oidc, { verify: vi.fn() }, () => now);

    await service.logout("session-token");

    expect(repo.revokeSession).toHaveBeenCalledWith(hashToken("session-token"));
  });
});
