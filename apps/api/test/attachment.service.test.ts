import type { AttachmentMetadata } from "@emil-ia/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AttachmentService,
  AttachmentValidationError,
  configuredPdfMaxContextChars,
} from "../src/services/attachment.service.js";
import type { PdfTextExtractor } from "../src/services/pdf-text-extractor.js";
import type {
  NewAttachment,
  StoredAttachment,
} from "../src/interfaces/persistence.interface.js";

const conversationId = "00000000-0000-4000-8000-000000000001";
const userId = "student-a";
const attachmentId = "00000000-0000-4000-8000-000000000002";
const otherAttachmentId = "00000000-0000-4000-8000-000000000003";
const pdf = Buffer.from("%PDF-1.7\nfixture");

function metadata(overrides: Partial<AttachmentMetadata> = {}): AttachmentMetadata {
  return {
    id: attachmentId,
    conversationId,
    filename: "notes.pdf",
    mimeType: "application/pdf",
    byteSize: pdf.length,
    status: "ready",
    extractionError: null,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    ...overrides,
  };
}

function storedAttachment(
  overrides: Partial<StoredAttachment> = {},
): StoredAttachment {
  return {
    ...metadata(),
    content: pdf,
    extractedText: "Referencia de cálculo",
    ...overrides,
  };
}

function setup(options?: {
  extract?: (content: Buffer) => Promise<string>;
  attachments?: StoredAttachment[];
  maxTextChars?: number;
  maxContextChars?: number;
}) {
  const created: NewAttachment[] = [];
  const repository = {
    findConversationTitle: vi.fn(async (_userId: string, id: string) =>
      id === conversationId ? "Conversación" : null,
    ),
    createAttachment: vi.fn(async (data: NewAttachment) => {
      created.push(data);
      return metadata({
        id: data.id,
        conversationId: data.conversationId,
        filename: data.filename,
        mimeType: data.mimeType,
        byteSize: data.byteSize,
        status: data.status,
        extractionError: data.extractionError,
      });
    }),
    listAttachments: vi.fn(async (_userId: string, _id: string) => [metadata()]),
    getAttachmentsForChat: vi.fn(async (_userId: string, _id: string, _ids: string[]) => options?.attachments ?? []),
    deleteAttachment: vi.fn(async (_userId: string, _id: string, _attachmentId: string) => true),
  };
  const extractor: PdfTextExtractor = {
    extract: options?.extract ?? (async () => "Texto extraído"),
  };
  const service = new AttachmentService(repository, extractor, {
    maxTextChars: options?.maxTextChars,
    maxContextChars: options?.maxContextChars,
  });
  return { service, repository, created };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AttachmentService", () => {
  it("persists a valid PDF with sanitized metadata and extracted text", async () => {
    const { service, created } = setup();

    const result = await service.upload(userId, conversationId, {
      filename: "../notas\u0000.pdf",
      mimetype: "application/pdf",
      content: pdf,
    });

    expect(result.status).toBe("ready");
    expect(created[0]).toEqual(
      expect.objectContaining({
        filename: "_notas_.pdf",
        content: pdf,
        extractedText: "Texto extraído",
        status: "ready",
      }),
    );
  });

  it("rejects files larger than 10 MiB before extraction or persistence", async () => {
    const { service, repository } = setup();

    await expect(
      service.upload(userId, conversationId, {
        filename: "large.pdf",
        mimetype: "application/pdf",
        content: Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]),
      }),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(repository.createAttachment).not.toHaveBeenCalled();
  });

  it("rejects a forged MIME type or PDF signature before persistence", async () => {
    const { service, repository } = setup();

    await expect(
      service.upload(userId, conversationId, {
        filename: "notes.pdf",
        mimetype: "text/plain",
        content: pdf,
      }),
    ).rejects.toBeInstanceOf(AttachmentValidationError);
    await expect(
      service.upload(userId, conversationId, {
        filename: "notes.pdf",
        mimetype: "application/pdf",
        content: Buffer.from("plain text"),
      }),
    ).rejects.toBeInstanceOf(AttachmentValidationError);
    expect(repository.createAttachment).not.toHaveBeenCalled();
  });

  it("persists extraction failures as failed attachments", async () => {
    const { service, created } = setup({
      extract: async () => {
        throw new Error("parser failed");
      },
    });

    const result = await service.upload(userId, conversationId, {
      filename: "broken.pdf",
      mimetype: "application/pdf",
      content: pdf,
    });

    expect(result.status).toBe("failed");
    expect(created[0]).toEqual(
      expect.objectContaining({
        content: pdf,
        extractedText: "",
        status: "failed",
        extractionError: "parser failed",
      }),
    );
  });

  it("marks PDFs without extractable text as failed", async () => {
    const { service, created } = setup({ extract: async () => "" });

    const result = await service.upload(userId, conversationId, {
      filename: "scan.pdf",
      mimetype: "application/pdf",
      content: pdf,
    });

    expect(result.status).toBe("failed");
    expect(created[0].extractionError).toBe("No extractable text found");
  });

  it("lists metadata without returning PDF bytes", async () => {
    const { service, repository } = setup();

    const result = await service.list(userId, conversationId);

    expect(result).toEqual([metadata()]);
    expect(result[0]).not.toHaveProperty("content");
    expect(repository.listAttachments).toHaveBeenCalledWith(userId, conversationId);
  });

  it("deletes an attachment only within its conversation", async () => {
    const { service, repository } = setup();

    await service.deleteAttachment(userId, conversationId, attachmentId);

    expect(repository.deleteAttachment).toHaveBeenCalledWith(
      userId,
      conversationId,
      attachmentId,
    );
  });

  it("returns not found when the attachment is not owned by the conversation", async () => {
    const { service, repository } = setup();
    repository.deleteAttachment.mockResolvedValue(false);

    await expect(
      service.deleteAttachment(userId, conversationId, otherAttachmentId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects attachment IDs from another conversation", async () => {
    const { service } = setup({
      attachments: [
        storedAttachment({ id: otherAttachmentId, conversationId: "other" }),
      ],
    });

    await expect(service.getContext(userId, conversationId, [attachmentId])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("caps extracted text before building delimited model context", async () => {
    const { service } = setup({
      maxTextChars: 12,
      attachments: [
        storedAttachment({ extractedText: "12345678901234567890" }),
      ],
    });

    const context = await service.getContext(userId, conversationId, [attachmentId]);

    expect(context).toHaveLength(1);
    expect(context[0].content).toContain("123456789012");
    expect(context[0].content).not.toContain("1234567890123");
    expect(context[0].content).toContain("untrusted reference material");
  });

  it("keeps combined PDF context within the global budget and preserves delimiters", async () => {
    const { service } = setup({
      maxTextChars: 200,
      maxContextChars: 650,
      attachments: [
        storedAttachment({ extractedText: "A".repeat(200) }),
        storedAttachment({
          id: otherAttachmentId,
          filename: "second.pdf",
          extractedText: "B".repeat(200),
        }),
      ],
    });

    const context = await service.getContext(userId, conversationId, [
      attachmentId,
      otherAttachmentId,
    ]);
    const totalLength = context.reduce(
      (total, message) => total + message.content.length,
      0,
    );

    expect(totalLength).toBeLessThanOrEqual(650);
    expect(context).toHaveLength(2);
    expect(context[0].content).toContain("A".repeat(200));
    expect(context[1].content).toContain("B");
    expect(context[1].content).not.toContain("B".repeat(200));
    expect(context[1].content).toContain("</attachment>");
  });

  it("omits an attachment when its framing cannot fit the remaining budget", async () => {
    const { service } = setup({
      maxContextChars: 100,
      attachments: [storedAttachment({ extractedText: "Referencia" })],
    });

    await expect(service.getContext(userId, conversationId, [attachmentId])).resolves.toEqual([]);
  });

  it("falls back to the default global context budget for invalid configuration", () => {
    vi.stubEnv("PDF_MAX_CONTEXT_CHARS", "0");
    expect(configuredPdfMaxContextChars()).toBe(200_000);

    vi.stubEnv("PDF_MAX_CONTEXT_CHARS", "not-an-integer");
    expect(configuredPdfMaxContextChars()).toBe(200_000);
  });

  it("enforces the five attachment limit when assembling context", async () => {
    const { service } = setup();
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());

    await expect(service.getContext(userId, conversationId, ids)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
