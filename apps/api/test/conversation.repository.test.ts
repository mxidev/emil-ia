import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATABASE_QUERIES } from "../src/database/queries.js";
import { ConversationRepository } from "../src/repositories/conversation.repository.js";

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
