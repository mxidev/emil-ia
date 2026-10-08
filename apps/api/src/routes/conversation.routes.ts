import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConversationRepository } from "../repositories/conversation.repository.js";
import type { ExportService } from "../services/export.service.js";

const feedbackSchema = z.object({
  rating: z.enum(["positive", "negative"]),
  category: z.string().max(80).optional(),
});

export function registerConversationRoutes(
  app: FastifyInstance,
  repository: ConversationRepository,
  exportService: ExportService,
): void {
  app.get("/api/conversations", () => repository.listConversations());

  app.get("/api/conversations/:id/messages", (request) => {
    const { id } = request.params as { id: string };
    return repository.getMessages(id);
  });

  app.get("/api/conversations/:id/export.md", async (request, reply) => {
    const { id } = request.params as { id: string };
    const markdown = await exportService.createMarkdown(id);
    if (!markdown) return reply.notFound("Conversación no encontrada");
    
    return reply
      .header("content-type", "text/markdown; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="conversation-${id}.md"`,
      )
      .send(markdown);
  });

  app.get("/api/conversations/:id/export.pdf", async (request, reply) => {
    const { id } = request.params as { id: string };
    const pdf = await exportService.createPdf(id);
    if (!pdf) return reply.notFound("Conversación no encontrada");
    
    return reply
      .header("content-type", "application/pdf")
      .header(
        "content-disposition",
        `attachment; filename="conversation-${id}.pdf"`,
      )
      .send(pdf);
  });

  app.post("/api/conversations/:id/feedback", async (request, reply) => {
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(JSON.stringify(parsed.error.flatten()));
    }
    
    const { id } = request.params as { id: string };
    await repository.addFeedback(id, parsed.data.rating, parsed.data.category);
    return { ok: true };
  });
}
