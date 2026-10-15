import Fastify from "fastify";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AttachmentNotFoundError,
  AttachmentServiceError,
  AttachmentValidationError,
} from "../src/services/attachment.service.js";
import { registerAttachmentRoutes } from "../src/routes/attachment.routes.js";
import type { AttachmentMetadata } from "@emil-ia/contracts";

const conversationId = "00000000-0000-4000-8000-000000000001";
const metadata: AttachmentMetadata = {
  id: "00000000-0000-4000-8000-000000000002",
  conversationId,
  filename: "notes.pdf",
  mimeType: "application/pdf",
  byteSize: 16,
  status: "ready",
  extractionError: null,
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
};

function multipartPdf(
  content = Buffer.from("%PDF-1.7\nfixture"),
  filename = "notes.pdf",
): { body: Buffer; contentType: string } {
  const boundary = "----emil-ia-test-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([prefix, content, suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function createApp(service: {
  upload: (...args: never[]) => Promise<AttachmentMetadata>;
  list: (...args: never[]) => Promise<AttachmentMetadata[]>;
  deleteAttachment: (...args: never[]) => Promise<void>;
}) {
  const app = Fastify();
  await app.register(sensible);
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024 },
  });
  registerAttachmentRoutes(app, service as never);
  await app.ready();
  return app;
}

describe("attachment routes", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it("uploads one PDF and returns metadata", async () => {
    const service = {
      upload: vi.fn(async () => metadata),
      list: vi.fn(async () => [metadata]),
      deleteAttachment: vi.fn(async () => {}),
    };
    app = await createApp(service);
    const upload = multipartPdf();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/attachments`,
      headers: { "content-type": upload.contentType },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(metadata);
    expect(service.upload).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        filename: "notes.pdf",
        mimetype: "application/pdf",
        content: expect.any(Buffer),
      }),
    );
  });

  it("lists metadata without exposing PDF bytes", async () => {
    const service = {
      upload: vi.fn(async () => metadata),
      list: vi.fn(async () => [metadata]),
      deleteAttachment: vi.fn(async () => {}),
    };
    app = await createApp(service);

    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}/attachments`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([metadata]);
    expect(response.body).not.toContain("PDF-1.7");
  });

  it("maps validation and unknown conversation errors", async () => {
    const service = {
      upload: vi
        .fn()
        .mockRejectedValueOnce(new AttachmentValidationError("Only PDFs"))
        .mockRejectedValueOnce(new AttachmentNotFoundError("Not found")),
      list: vi.fn(async () => [metadata]),
      deleteAttachment: vi.fn(async () => {}),
    };
    app = await createApp(service);
    const upload = multipartPdf();

    const invalid = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/attachments`,
      headers: { "content-type": upload.contentType },
      payload: upload.body,
    });
    const missing = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/attachments`,
      headers: { "content-type": upload.contentType },
      payload: upload.body,
    });

    expect(invalid.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });

  it("returns failed extraction metadata without hiding the upload", async () => {
    const failed = { ...metadata, status: "failed" as const, extractionError: "No text" };
    const service = {
      upload: vi.fn(async () => failed),
      list: vi.fn(async () => [failed]),
      deleteAttachment: vi.fn(async () => {}),
    };
    app = await createApp(service);

    const upload = multipartPdf();
    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/attachments`,
      headers: { "content-type": upload.contentType },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "failed" });
  });

  it("rejects an oversized multipart file", async () => {
    const service = {
      upload: vi.fn(async () => metadata),
      list: vi.fn(async () => [metadata]),
      deleteAttachment: vi.fn(async () => {}),
    };
    app = await createApp(service);
    const upload = multipartPdf(Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(10 * 1024 * 1024)]));

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/attachments`,
      headers: { "content-type": upload.contentType },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(413);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it("deletes an attachment from its conversation", async () => {
    const service = {
      upload: vi.fn(async () => metadata),
      list: vi.fn(async () => [metadata]),
      deleteAttachment: vi.fn(async () => {}),
    };
    app = await createApp(service);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversationId}/attachments/${metadata.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(service.deleteAttachment).toHaveBeenCalledWith(
      conversationId,
      metadata.id,
    );
  });
});
