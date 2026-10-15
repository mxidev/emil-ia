import Fastify from "fastify";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import { Pool } from "pg";
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
    registerChatRoutes(
      app,
      new ChatService(repository, provider, verifier, attachmentService),
    );
    registerConversationRoutes(app, repository, new ExportService(repository));
    registerAttachmentRoutes(app, attachmentService);
    registerAnalyticsRoutes(app, repository);
    await app.ready();
    return { app, close };
  } catch (error) {
    await close();
    throw error;
  }
}
