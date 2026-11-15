import Fastify from "fastify";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import { Pool } from "pg";
import type { InjectOptions } from "light-my-request";
import type { AIProvider } from "../../src/provider.js";
import { ConversationRepository } from "../../src/repositories/conversation.repository.js";
import { registerChatRoutes } from "../../src/routes/chat.routes.js";
import { registerConversationRoutes } from "../../src/routes/conversation.routes.js";
import { registerAnalyticsRoutes } from "../../src/routes/analytics.routes.js";
import { registerAttachmentRoutes } from "../../src/routes/attachment.routes.js";
import { ChatService } from "../../src/services/chat.service.js";
import { ExportService } from "../../src/services/export.service.js";
import { MathVerificationService } from "../../src/services/math-verification.service.js";
import { SandboxClient } from "../../src/sandbox.js";
import { AttachmentService, configuredPdfMaxBytes } from "../../src/services/attachment.service.js";
import { PdfParseTextExtractor } from "../../src/services/pdf-text-extractor.js";
import { AuthRepository } from "../../src/auth/auth.repository.js";
import { AuthService } from "../../src/auth/auth.service.js";
import { registerAuthPlugin } from "../../src/auth/auth.plugin.js";
import { hashToken } from "../../src/auth/auth.crypto.js";
import type { AuthConfig } from "../../src/auth/auth.types.js";

// Never read .env or DATABASE_URL: this harness only uses explicit test settings.
export async function createIntegrationApp(provider: AIProvider) {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://emilia:emilia@localhost:5432/emilia";
  const sandboxUrl = process.env.TEST_SANDBOX_URL ?? "http://localhost:8001";
  for (const address of [databaseUrl, sandboxUrl]) {
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(address).hostname)
    ) {
      throw new Error("Integration services must use a loopback address");
    }
  }

  const schema = `integration_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
  });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
    options: `-c search_path=${schema}`,
  });
  const app = Fastify();
  let created = false;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      await app.close();
    } finally {
      try {
        await pool.end();
      } finally {
        try {
          if (created && /^integration_[a-f0-9]{32}$/.test(schema)) {
            await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
          }
        } finally {
          await admin.end();
        }
      }
    }
  }

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    // A URL with its own options must not silently override schema isolation.
    const result = await pool.query<{ current_schema: string }>(
      "SELECT current_schema()",
    );
    if (result.rows[0].current_schema !== schema) {
      throw new Error("Integration database schema isolation failed");
    }
    const repository = new ConversationRepository(pool);
    await repository.initialize();
    const authConfig: AuthConfig = {
      issuer: "http://localhost:4566/integration-pool",
      clientId: "integration-client",
      redirectUri: "http://localhost:3000/api/auth/callback",
      logoutUri: "http://localhost:4200/",
      allowedOrigin: "http://localhost:4200",
      sessionSecret: Buffer.alloc(32, 6),
      cookieName: "emilia_session",
      cookieSecure: false,
      sessionIdleTtlMs: 7 * 24 * 60 * 60 * 1000,
      sessionAbsoluteTtlMs: 30 * 24 * 60 * 60 * 1000,
      loginStateTtlMs: 10 * 60 * 1000,
    };
    const authRepository = new AuthRepository(pool, authConfig.sessionSecret);
    const user = await authRepository.findOrCreateUser(
      { issuer: authConfig.issuer, subject: "integration-student" },
      "Integration Student",
    );
    const sessionCookie = "integration-session-token";
    const secondSessionCookie = "integration-second-session-token";
    const sessionNow = new Date("2026-11-15T18:00:00.000Z");
    await authRepository.createSession({
      sessionHash: hashToken(sessionCookie),
      userId: user.id,
      providerTokens: {
        accessToken: "integration-access-token",
        refreshToken: "integration-refresh-token",
        accessTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      createdAt: sessionNow,
      lastSeenAt: sessionNow,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      absoluteExpiresAt: new Date("2099-01-02T00:00:00.000Z"),
      revokedAt: null,
    });
    const secondUser = await authRepository.findOrCreateUser(
      { issuer: authConfig.issuer, subject: "integration-second-student" },
      "Integration Second Student",
    );
    await authRepository.createSession({
      sessionHash: hashToken(secondSessionCookie),
      userId: secondUser.id,
      providerTokens: {
        accessToken: "integration-second-access-token",
        refreshToken: "integration-second-refresh-token",
        accessTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      createdAt: sessionNow,
      lastSeenAt: sessionNow,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      absoluteExpiresAt: new Date("2099-01-02T00:00:00.000Z"),
      revokedAt: null,
    });
    const authService = new AuthService(
      authConfig,
      authRepository,
      {
        getAuthorizationUrl: async () => "http://localhost:4500",
        exchangeCode: async () => {
          throw new Error("Integration fixture does not perform browser login");
        },
        validateIdTokenNonce: async () => undefined,
        refresh: async () => {
          throw new Error("Integration fixture refresh was not expected");
        },
        revoke: async () => undefined,
        getUserInfo: async () => ({}),
      },
      { verify: async () => { throw new Error("Integration fixture token refresh was not expected"); } },
      () => sessionNow,
    );
    const sandbox = new SandboxClient(sandboxUrl);
    const verifier = new MathVerificationService(provider, sandbox);
    const attachmentService = new AttachmentService(
      repository,
      new PdfParseTextExtractor(),
    );
    await app.register(sensible);
    await app.register(multipart, {
      limits: { files: 1, fileSize: configuredPdfMaxBytes() },
    });
    registerAuthPlugin(app, { config: authConfig, service: authService });
    registerChatRoutes(
      app,
      new ChatService(repository, provider, verifier, attachmentService),
    );
    registerConversationRoutes(app, repository, new ExportService(repository));
    registerAttachmentRoutes(app, attachmentService);
    registerAnalyticsRoutes(app, repository);
    await app.ready();
    async function injectAs(session: string, options: InjectOptions) {
      const method = String(options.method ?? "GET").toUpperCase();
      const incomingHeaders = { ...(options.headers ?? {}) } as Record<string, string>;
      const csrfRequired = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      incomingHeaders.cookie = `emilia_session=${session}; emilia_csrf=integration-csrf`;
      if (csrfRequired) {
        incomingHeaders.origin = authConfig.allowedOrigin;
        incomingHeaders["x-csrf-token"] = "integration-csrf";
      }
      return app.inject({ ...options, headers: incomingHeaders });
    }
    const inject = (options: InjectOptions) => injectAs(sessionCookie, options);
    const injectAsSecondUser = (options: InjectOptions) => injectAs(secondSessionCookie, options);
    return { app, inject, injectAsSecondUser, close, userId: user.id, secondUserId: secondUser.id };
  } catch (error) {
    await close();
    throw error;
  }
}
