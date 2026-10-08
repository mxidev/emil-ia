import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { ChatRequestSchema } from "@emil-ia/contracts";
import { routePrompt } from "./router.js";
import { createProvider } from "./provider.js";
import { DatabaseStore } from "./db.js";

dotenv.config({ path: "../../.env" });

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "http://localhost:4200" });
await app.register(sensible);

const provider = createProvider();
const store = new DatabaseStore();

app.get("/health", async () => ({
  status: "ok",
  provider: provider.constructor.name,
  persistence: "postgresql",
}));

app.get("/api/conversations", async () => store.listConversations());
app.get("/api/conversations/:id/messages", async (request) => {
  const params = request.params as { id: string };
  return store.getMessages(params.id);
});

app.post("/api/chat", async (request, reply) => {
  const parsed = ChatRequestSchema.safeParse(request.body);
  if (!parsed.success)
    return reply.badRequest(JSON.stringify(parsed.error.flatten()));
  
  const conversationId = parsed.data.conversationId ?? crypto.randomUUID();
  if (!parsed.data.conversationId)
    await store.createConversation(conversationId, parsed.data.content);
  
  const history = await store.getMessages(conversationId);
  await store.addMessage(conversationId, {
    role: "user",
    content: parsed.data.content,
  });
  
  history.push({ role: "user", content: parsed.data.content });
  const { intent, profile } = routePrompt(parsed.data.content);
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-conversation-id": conversationId,
  });
  
  let answer = "";
  const startedAt = Date.now();
  try {
    for await (const event of provider.stream({
      messages: history,
      profile,
      intent,
    })) {
      if (event.type === "text") {
        answer += event.delta;
        reply.raw.write(
          `event: token\ndata: ${JSON.stringify({ delta: event.delta })}\n\n`,
        );
      } else if (event.type === "done") {
        await store.addMessage(conversationId, {
          role: "assistant",
          content: answer,
        });
        await store.recordExecution({
          id: event.executionId,
          conversationId,
          profile,
          intent,
          latencyMs: Date.now() - startedAt,
        });
        reply.raw.write(
          `event: done\ndata: ${JSON.stringify({ ...event, conversationId })}\n\n`,
        );
      } else {
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({ ...event, conversationId })}\n\n`,
        );
      }
    }
  } catch (error) {
    reply.raw.write(
      `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Error desconocido" })}\n\n`,
    );
  } finally {
    reply.raw.end();
  }
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  await store.init();
  await app.listen({ port, host: "0.0.0.0" });
}

export { app };
