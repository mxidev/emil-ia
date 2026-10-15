import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import { createPostgresPool } from "./database/postgres.client.js";
import { createProvider } from "./provider.js";
import { createCorsOptions } from "./cors.js";
import { ConversationRepository } from "./repositories/conversation.repository.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerAttachmentRoutes } from "./routes/attachment.routes.js";
import { registerChatRoutes } from "./routes/chat.routes.js";
import { registerConversationRoutes } from "./routes/conversation.routes.js";
import { registerToolRoutes } from "./routes/tool.routes.js";
import { SandboxClient } from "./sandbox.js";
import { ChatService } from "./services/chat.service.js";
import { ExportService } from "./services/export.service.js";
import { MathVerificationService } from "./services/math-verification.service.js";
import {
  AttachmentService,
  configuredPdfMaxBytes,
} from "./services/attachment.service.js";
import { PdfParseTextExtractor } from "./services/pdf-text-extractor.js";

dotenv.config({ path: "../../.env" });

const app = Fastify({ logger: true });
await app.register(cors, {
  ...createCorsOptions(),
});
await app.register(sensible);
await app.register(multipart, {
  limits: { files: 1, fileSize: configuredPdfMaxBytes() },
});

const provider = createProvider({
  info: (fields, message) => app.log.info(fields, message),
  error: (fields, message) => app.log.error(fields, message),
});
const repository = new ConversationRepository(createPostgresPool());
const sandbox = new SandboxClient();
const mathVerification = new MathVerificationService(provider, sandbox, app.log);
const attachmentService = new AttachmentService(
  repository,
  new PdfParseTextExtractor(),
);
const chatService = new ChatService(
  repository,
  provider,
  mathVerification,
  attachmentService,
);
const exportService = new ExportService(repository);

app.get("/health", async () => ({
  status: "ok",
  provider: provider.constructor.name,
  persistence: "postgresql",
}));
registerAnalyticsRoutes(app, repository);
registerConversationRoutes(app, repository, exportService);
registerAttachmentRoutes(app, attachmentService);
registerToolRoutes(app, sandbox);
registerChatRoutes(app, chatService);

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  await repository.initialize();
  await app.listen({ port, host: "0.0.0.0" });
}

export { app };
