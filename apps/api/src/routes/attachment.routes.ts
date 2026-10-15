import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AttachmentServiceError,
  type AttachmentService,
} from "../services/attachment.service.js";

type AttachmentRouteService = Pick<
  AttachmentService,
  "upload" | "list" | "deleteAttachment"
>;

function sendAttachmentError(reply: FastifyReply, error: unknown) {
  if (error instanceof AttachmentServiceError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: unknown }).statusCode === 413
  ) {
    return reply.code(413).send({ error: "PDF exceeds the maximum allowed size" });
  }
  return reply.code(400).send({ error: "Invalid PDF upload" });
}

export function registerAttachmentRoutes(
  app: FastifyInstance,
  service: AttachmentRouteService,
): void {
  app.post("/api/conversations/:id/attachments", async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) return reply.badRequest("A PDF file is required");

      const content = await file.toBuffer();
      const { id } = request.params as { id: string };
      const attachment = await service.upload(id, {
        filename: file.filename,
        mimetype: file.mimetype,
        content,
      });
      return reply.code(201).send(attachment);
    } catch (error) {
      return sendAttachmentError(reply, error);
    }
  });

  app.get("/api/conversations/:id/attachments", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await service.list(id);
    } catch (error) {
      return sendAttachmentError(reply, error);
    }
  });

  app.delete(
    "/api/conversations/:id/attachments/:attachmentId",
    async (request, reply) => {
      try {
        const { id, attachmentId } = request.params as {
          id: string;
          attachmentId: string;
        };
        await service.deleteAttachment(id, attachmentId);
        return reply.code(204).send();
      } catch (error) {
        return sendAttachmentError(reply, error);
      }
    },
  );
}
