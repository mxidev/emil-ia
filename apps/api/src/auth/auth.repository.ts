import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { decryptSecret, encryptSecret } from "./auth.crypto.js";
import type {
  AuthSession,
  AuthenticatedUser,
  EncryptedSecret,
  ExternalIdentity,
  LoginTransaction,
  ProviderTokens,
} from "./auth.types.js";
import { DATABASE_QUERIES } from "../database/queries.js";

type UserRow = {
  id: string;
  displayName: string;
  authIssuer: string;
  authSubject: string;
};

type LoginTransactionRow = {
  stateHash: string;
  nonce: string;
  codeVerifierCiphertext: string;
  codeVerifierIv: string;
  codeVerifierAuthTag: string;
  redirectUri: string;
  expiresAt: Date | string;
};

type SessionRow = {
  sessionHash: string;
  userId: string;
  accessTokenCiphertext: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
  refreshTokenCiphertext: string;
  refreshTokenIv: string;
  refreshTokenAuthTag: string;
  accessTokenExpiresAt: Date | string;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  expiresAt: Date | string;
  absoluteExpiresAt: Date | string;
  revokedAt: Date | string | null;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function encrypted(
  ciphertext: string,
  iv: string,
  authTag: string,
): EncryptedSecret {
  return { ciphertext, iv, authTag };
}

export class AuthRepository {
  constructor(
    private readonly pool: Pool,
    private readonly encryptionKey: Buffer,
  ) {}

  async findOrCreateUser(
    identity: ExternalIdentity,
    displayName: string,
  ): Promise<AuthenticatedUser> {
    const result = await this.pool.query<UserRow>(
      DATABASE_QUERIES.upsertAuthUser,
      [randomUUID(), displayName, identity.issuer, identity.subject],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Authenticated user was not returned");
    return {
      id: row.id,
      displayName: row.displayName,
      issuer: row.authIssuer,
      subject: row.authSubject,
    };
  }

  async findUserById(userId: string): Promise<AuthenticatedUser | null> {
    const result = await this.pool.query<UserRow>(DATABASE_QUERIES.findAuthUserById, [
      userId,
    ]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.displayName,
      issuer: row.authIssuer,
      subject: row.authSubject,
    };
  }

  async createLoginTransaction(transaction: LoginTransaction): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.createLoginTransaction, [
      transaction.stateHash,
      transaction.nonce,
      transaction.codeVerifier.ciphertext,
      transaction.codeVerifier.iv,
      transaction.codeVerifier.authTag,
      transaction.redirectUri,
      transaction.expiresAt,
    ]);
  }

  async consumeLoginTransaction(
    stateHash: string,
  ): Promise<LoginTransaction | null> {
    const result = await this.pool.query<LoginTransactionRow>(
      DATABASE_QUERIES.consumeLoginTransaction,
      [stateHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      stateHash: row.stateHash,
      nonce: row.nonce,
      codeVerifier: encrypted(
        row.codeVerifierCiphertext,
        row.codeVerifierIv,
        row.codeVerifierAuthTag,
      ),
      redirectUri: row.redirectUri,
      expiresAt: asDate(row.expiresAt),
    };
  }

  encryptProviderTokens(tokens: ProviderTokens): {
    accessToken: EncryptedSecret;
    refreshToken: EncryptedSecret;
  } {
    return {
      accessToken: encryptSecret(tokens.accessToken, this.encryptionKey),
      refreshToken: encryptSecret(tokens.refreshToken, this.encryptionKey),
    };
  }

  async createSession(session: AuthSession): Promise<void> {
    const encryptedTokens = this.encryptProviderTokens(session.providerTokens);
    await this.pool.query(DATABASE_QUERIES.createSession, [
      session.sessionHash,
      session.userId,
      encryptedTokens.accessToken.ciphertext,
      encryptedTokens.accessToken.iv,
      encryptedTokens.accessToken.authTag,
      encryptedTokens.refreshToken.ciphertext,
      encryptedTokens.refreshToken.iv,
      encryptedTokens.refreshToken.authTag,
      session.providerTokens.accessTokenExpiresAt,
      session.createdAt,
      session.lastSeenAt,
      session.expiresAt,
      session.absoluteExpiresAt,
    ]);
  }

  async findSession(sessionHash: string): Promise<AuthSession | null> {
    const result = await this.pool.query<SessionRow>(DATABASE_QUERIES.findSession, [
      sessionHash,
    ]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      sessionHash: row.sessionHash,
      userId: row.userId,
      providerTokens: {
        accessToken: decryptSecret(
          encrypted(
            row.accessTokenCiphertext,
            row.accessTokenIv,
            row.accessTokenAuthTag,
          ),
          this.encryptionKey,
        ),
        refreshToken: decryptSecret(
          encrypted(
            row.refreshTokenCiphertext,
            row.refreshTokenIv,
            row.refreshTokenAuthTag,
          ),
          this.encryptionKey,
        ),
        accessTokenExpiresAt: asDate(row.accessTokenExpiresAt),
      },
      createdAt: asDate(row.createdAt),
      lastSeenAt: asDate(row.lastSeenAt),
      expiresAt: asDate(row.expiresAt),
      absoluteExpiresAt: asDate(row.absoluteExpiresAt),
      revokedAt: row.revokedAt === null ? null : asDate(row.revokedAt),
    };
  }

  async touchSession(
    sessionHash: string,
    providerTokens: ProviderTokens,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    const encryptedTokens = this.encryptProviderTokens(providerTokens);
    await this.pool.query(DATABASE_QUERIES.touchSession, [
      sessionHash,
      encryptedTokens.accessToken.ciphertext,
      encryptedTokens.accessToken.iv,
      encryptedTokens.accessToken.authTag,
      encryptedTokens.refreshToken.ciphertext,
      encryptedTokens.refreshToken.iv,
      encryptedTokens.refreshToken.authTag,
      providerTokens.accessTokenExpiresAt,
      lastSeenAt,
      expiresAt,
    ]);
  }

  async revokeSession(sessionHash: string): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.revokeSession, [sessionHash]);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.revokeAllUserSessions, [userId]);
  }
}
