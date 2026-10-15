import Fastify from "fastify";
import cors from "@fastify/cors";
import { ChatRequestSchema } from "@emil-ia/contracts";
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

  it("allows the browser to read the streamed response across origins", async () => {
    const app = Fastify();
    await app.register(cors, { origin: "http://localhost:4200" });
    registerChatRoutes(app, {
      prepare: async () => ({
        conversationId: "00000000-0000-4000-8000-000000000001",
        profile: "DEFAULT",
        intent: "EXPLAIN",
        sandboxStatus: "not_applicable",
        events: (async function* () {
          yield { type: "text", delta: "Respuesta" };
          yield { type: "done", executionId: crypto.randomUUID() };
        })(),
      }),
      complete: async () => {},
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { origin: "http://localhost:4200" },
      payload: { content: "Explica un vector" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: done");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:4200");
    await app.close();
  });

  it("accepts a bounded list of UUID attachment IDs", () => {
    const attachmentIds = Array.from({ length: 5 }, () => crypto.randomUUID());

    expect(
      ChatRequestSchema.parse({ content: "Resume esto", attachmentIds }),
    ).toEqual({ content: "Resume esto", attachmentIds });
  });

  it("rejects more than five attachment IDs", () => {
    const attachmentIds = Array.from({ length: 6 }, () => crypto.randomUUID());

    expect(() =>
      ChatRequestSchema.parse({ content: "Resume esto", attachmentIds }),
    ).toThrow();
  });

  it("rejects non-UUID attachment IDs", () => {
    expect(() =>
      ChatRequestSchema.parse({
        content: "Resume esto",
        attachmentIds: ["not-an-attachment-id"],
      }),
    ).toThrow();
  });
});
