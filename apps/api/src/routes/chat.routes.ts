import { ChatRequestSchema } from "@emil-ia/contracts";
import type { FastifyInstance } from "fastify";
import { AttachmentServiceError } from "../services/attachment.service.js";
import type { ChatService } from "../services/chat.service.js";

export function registerChatRoutes(
  app: FastifyInstance,
  chat: ChatService,
): void {
  app.post("/api/chat", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(JSON.stringify(parsed.error.flatten()));
    }

    const startedAt = Date.now();
    let context;
    try {
      context = await chat.prepare(
        parsed.data.content,
        parsed.data.conversationId,
        parsed.data.attachmentIds,
      );
    } catch (error) {
      if (error instanceof AttachmentServiceError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }

    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value);
    }

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-conversation-id": context.conversationId,
    });

    let answer = "";
    try {
      for await (const event of context.events) {
        if (event.type === "text") {
          answer += event.delta;
          reply.raw.write(
            `event: token\ndata: ${JSON.stringify({ delta: event.delta })}\n\n`,
          );
        } else if (event.type === "done") {
          await chat.complete({
            executionId: event.executionId,
            conversationId: context.conversationId,
            content: answer,
            profile: context.profile,
            intent: context.intent,
            latencyMs: Date.now() - startedAt,
            sandboxStatus: context.sandboxStatus,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          });
          reply.raw.write(
            `event: done\ndata: ${JSON.stringify({ ...event, conversationId: context.conversationId })}\n\n`,
          );
        } else {
          reply.raw.write(
            `event: error\ndata: ${JSON.stringify({ ...event, conversationId: context.conversationId })}\n\n`,
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
}
