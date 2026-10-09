import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { createPostgresPool } from "./database/postgres.client.js";
import { createProvider } from "./provider.js";
import { ConversationRepository } from "./repositories/conversation.repository.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerChatRoutes } from "./routes/chat.routes.js";
import { registerConversationRoutes } from "./routes/conversation.routes.js";
import { registerToolRoutes } from "./routes/tool.routes.js";
import { SandboxClient } from "./sandbox.js";
import { ChatService } from "./services/chat.service.js";
import { ExportService } from "./services/export.service.js";
import { MathVerificationService } from "./services/math-verification.service.js";

dotenv.config({ path: "../../.env" });

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? "http://localhost:4200",
});
await app.register(sensible);

const provider = createProvider();
const repository = new ConversationRepository(createPostgresPool());
const sandbox = new SandboxClient();
const mathVerification = new MathVerificationService(provider, sandbox, app.log);
const chatService = new ChatService(repository, provider, mathVerification);
const exportService = new ExportService(repository);

app.get("/health", async () => ({
  status: "ok",
  provider: provider.constructor.name,
  persistence: "postgresql",
}));
registerAnalyticsRoutes(app, repository);
registerConversationRoutes(app, repository, exportService);
registerToolRoutes(app, sandbox);
registerChatRoutes(app, chatService);

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  await repository.initialize();
  await app.listen({ port, host: "0.0.0.0" });
}

export { app };
