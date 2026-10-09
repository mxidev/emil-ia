import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerChatRoutes } from "../src/routes/chat.routes.js";

describe("chat routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists usage and measures latency from before preparation", async () => {
    const completed: unknown[] = [];
    let currentTime = 100;
    const chat = {
      prepare: async () => {
        currentTime = 150;
        return {
          conversationId: "00000000-0000-4000-8000-000000000001",
          profile: "MATH" as const,
          intent: "COMPUTE" as const,
          sandboxStatus: "success" as const,
          events: (async function* () {
            yield { type: "text" as const, delta: "42" };
            currentTime = 200;
            yield {
              type: "done" as const,
              executionId: "00000000-0000-4000-8000-000000000042",
              profile: "MATH" as const,
              intent: "COMPUTE" as const,
              inputTokens: 12,
              outputTokens: 34,
            };
          })(),
        };
      },
      complete: async (data: unknown) => {
        completed.push(data);
      },
    };
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const app = Fastify();
    registerChatRoutes(app, chat as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "Calcula 6 * 7" },
    });

    expect(response.statusCode).toBe(200);
    expect(completed).toEqual([
      expect.objectContaining({
        latencyMs: 100,
        inputTokens: 12,
        outputTokens: 34,
      }),
    ]);
    await app.close();
  });
});
