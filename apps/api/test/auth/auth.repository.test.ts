import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DATABASE_QUERIES } from "../../src/database/queries.js";
import { AuthRepository } from "../../src/auth/auth.repository.js";
import type {
  EncryptedSecret,
  ProviderTokens,
} from "../../src/auth/auth.types.js";

const identity = {
  issuer: "http://localhost:4566/pool-123",
  subject: "subject-123",
};
const encrypted: EncryptedSecret = {
  ciphertext: "ciphertext",
  iv: "iv",
  authTag: "tag",
};
const providerTokens: ProviderTokens = {
  accessToken: "access",
  refreshToken: "refresh",
  accessTokenExpiresAt: new Date("2026-11-15T19:00:00.000Z"),
};
const encryptionKey = Buffer.alloc(32, 4);

describe("AuthRepository", () => {
  it("upserts an external identity and maps the internal user", async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [
          {
            id: "user-123",
            displayName: "Ada Lovelace",
            authIssuer: identity.issuer,
            authSubject: identity.subject,
          },
        ],
      })),
    } as unknown as Pool;
    const repository = new AuthRepository(pool, encryptionKey);

    await expect(
      repository.findOrCreateUser(identity, "Ada Lovelace"),
    ).resolves.toEqual({ id: "user-123", displayName: "Ada Lovelace", ...identity });
    expect(pool.query).toHaveBeenCalledWith(
      DATABASE_QUERIES.upsertAuthUser,
      expect.arrayContaining(["Ada Lovelace", identity.issuer, identity.subject]),
    );
  });

  it("stores and atomically consumes a login transaction", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              stateHash: "state-hash",
              nonce: "nonce",
              codeVerifierCiphertext: encrypted.ciphertext,
              codeVerifierIv: encrypted.iv,
              codeVerifierAuthTag: encrypted.authTag,
              redirectUri: "http://localhost:3000/api/auth/callback",
              expiresAt: new Date("2026-11-15T18:10:00.000Z"),
            },
          ],
        }),
    } as unknown as Pool;
    const repository = new AuthRepository(pool, encryptionKey);
    const expiresAt = new Date("2026-11-15T18:10:00.000Z");

    await repository.createLoginTransaction({
      stateHash: "state-hash",
      nonce: "nonce",
      codeVerifier: encrypted,
      redirectUri: "http://localhost:3000/api/auth/callback",
      expiresAt,
    });

    await expect(repository.consumeLoginTransaction("state-hash")).resolves.toEqual({
      stateHash: "state-hash",
      nonce: "nonce",
      codeVerifier: encrypted,
      redirectUri: "http://localhost:3000/api/auth/callback",
      expiresAt,
    });
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      DATABASE_QUERIES.consumeLoginTransaction,
      ["state-hash"],
    );
  });

  it("persists and looks up a session with encrypted provider tokens", async () => {
    const query = vi.fn();
    query.mockResolvedValueOnce({ rows: [] });
    const pool = {
      query,
    } as unknown as Pool;
    const repository = new AuthRepository(pool, encryptionKey);

    await repository.createSession({
      sessionHash: "session-hash",
      userId: "user-123",
      providerTokens,
      createdAt: new Date("2026-11-15T18:00:00.000Z"),
      lastSeenAt: new Date("2026-11-15T18:00:00.000Z"),
      expiresAt: new Date("2026-11-22T18:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-12-15T18:00:00.000Z"),
      revokedAt: null,
    });

    const encryptedProviderTokens = repository.encryptProviderTokens(providerTokens);
    query.mockClear();
    query.mockResolvedValue({
      rows: [
        {
          sessionHash: "session-hash",
          userId: "user-123",
          accessTokenCiphertext: encryptedProviderTokens.accessToken.ciphertext,
          accessTokenIv: encryptedProviderTokens.accessToken.iv,
          accessTokenAuthTag: encryptedProviderTokens.accessToken.authTag,
          refreshTokenCiphertext: encryptedProviderTokens.refreshToken.ciphertext,
          refreshTokenIv: encryptedProviderTokens.refreshToken.iv,
          refreshTokenAuthTag: encryptedProviderTokens.refreshToken.authTag,
          accessTokenExpiresAt: providerTokens.accessTokenExpiresAt,
          createdAt: new Date("2026-11-15T18:00:00.000Z"),
          lastSeenAt: new Date("2026-11-15T18:00:00.000Z"),
          expiresAt: new Date("2026-11-22T18:00:00.000Z"),
          absoluteExpiresAt: new Date("2026-12-15T18:00:00.000Z"),
          revokedAt: null,
        },
      ],
    });
    await expect(repository.findSession("session-hash")).resolves.toMatchObject({
      sessionHash: "session-hash",
      userId: "user-123",
      providerTokens,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      DATABASE_QUERIES.findSession,
      ["session-hash"],
    );
  });
});
