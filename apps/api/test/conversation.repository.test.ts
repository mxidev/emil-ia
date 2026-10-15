import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATABASE_QUERIES } from "../src/database/queries.js";
import { ConversationRepository } from "../src/repositories/conversation.repository.js";
import type { NewAttachment } from "../src/interfaces/persistence.interface.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ConversationRepository execution metadata", () => {
  it("writes usage and sandbox metadata to their existing columns", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "");
    vi.stubEnv("OPENCODE_MODEL", "");
    const calls: Array<{ sql: string; parameters: unknown[] | undefined }> = [];
    const pool = {
      query: async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        return { rows: [] };
      },
    } as unknown as Pool;
    const repository = new ConversationRepository(pool);

    await repository.recordExecution({
      id: "00000000-0000-4000-8000-000000000042",
      conversationId: "00000000-0000-4000-8000-000000000001",
      profile: "MATH",
      intent: "COMPUTE",
      latencyMs: 25,
      inputTokens: 12,
      outputTokens: 34,
      metadata: { sandbox: { status: "success" } },
    });

    expect(calls).toEqual([
      {
        sql: DATABASE_QUERIES.recordExecution,
        parameters: [
          "00000000-0000-4000-8000-000000000042",
          "00000000-0000-4000-8000-000000000001",
          "mock",
          null,
          "MATH",
          "COMPUTE",
          25,
          12,
          34,
          { sandbox: { status: "success" } },
        ],
      },
    ]);
  });
});

describe("ConversationRepository attachments", () => {
  it("persists and maps attachment metadata", async () => {
    const pool = {
      query: vi.fn(async () => ({
        rows: [
          {
            id: "attachment-id",
            conversationId: "conversation-id",
            filename: "notes.pdf",
            mimeType: "application/pdf",
            byteSize: 12,
            status: "ready",
            extractionError: null,
            createdAt: "2026-10-15T00:00:00.000Z",
            updatedAt: "2026-10-15T00:00:00.000Z",
          },
        ],
      })),
    } as unknown as Pool;
    const repository = new ConversationRepository(pool);
    const data: NewAttachment = {
      id: "attachment-id",
      conversationId: "conversation-id",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      byteSize: 12,
      content: Buffer.from("%PDF-1.7"),
      extractedText: "Texto",
      status: "ready",
    };

    await expect(repository.createAttachment(data)).resolves.toEqual(
      expect.objectContaining({ id: "attachment-id", status: "ready" }),
    );
    expect(pool.query).toHaveBeenCalledWith(
      DATABASE_QUERIES.createAttachment,
      [
        data.id,
        data.conversationId,
        data.filename,
        data.mimeType,
        data.byteSize,
        data.content,
        data.extractedText,
        data.status,
        null,
      ],
    );
  });

  it("lists metadata without selecting PDF content", async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as Pool;
    const repository = new ConversationRepository(pool);

    await repository.listAttachments("conversation-id");

    expect(pool.query).toHaveBeenCalledWith(
      DATABASE_QUERIES.listAttachments,
      ["conversation-id"],
    );
    expect(DATABASE_QUERIES.listAttachments.toLowerCase()).not.toContain(
      "content",
    );
  });
});
