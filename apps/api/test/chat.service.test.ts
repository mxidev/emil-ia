import type { AIEvent, AIRequest } from "@emil-ia/contracts";
import type { ModelExecutionRecord } from "../src/interfaces/persistence.interface.js";
import type { AIProvider } from "../src/provider.js";
import { describe, expect, it } from "vitest";
import { ChatService } from "../src/services/chat.service.js";

class MemoryRepository {
  readonly executions: ModelExecutionRecord[] = [];
  readonly messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  async createConversation(): Promise<void> {}

  async getMessages() {
    return [...this.messages];
  }

  async addMessage(
    _conversationId: string,
    message: { role: "user" | "assistant"; content: string },
  ): Promise<void> {
    this.messages.push(message);
  }

  async recordExecution(data: ModelExecutionRecord): Promise<void> {
    this.executions.push(data);
  }
}

function contextualProvider(): AIProvider {
  return {
    generate: async () => null,
    async *stream(request: AIRequest): AsyncIterable<AIEvent> {
      const resultContext = request.messages.find(
        (message) => message.role === "system",
      )?.content;
      yield {
        type: "text",
        delta: resultContext?.includes("42")
          ? "La respuesta verificada es 42."
          : "Respuesta sin verificar.",
      };
      yield {
        type: "done",
        executionId: "00000000-0000-4000-8000-000000000042",
        profile: request.profile,
        intent: request.intent,
      };
    },
  };
}

async function collect(events: AsyncIterable<AIEvent>): Promise<AIEvent[]> {
  const collected: AIEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe("ChatService math verification", () => {
  it("streams a verified answer and footer before done", async () => {
    const repository = new MemoryRepository();
    const verifier = {
      verify: async () => ({
        status: "success" as const,
        systemMessage: "Resultado verificado por el sandbox: 42.",
        footer:
          "\n\n> Cálculo verificado automáticamente en el sandbox. Resultado: `42`.",
      }),
    };
    const chat = new ChatService(
      repository as never,
      contextualProvider(),
      verifier as never,
    );

    const prepared = await chat.prepare("Calcula 6 * 7");

    await expect(collect(prepared.events)).resolves.toEqual([
      { type: "text", delta: "La respuesta verificada es 42." },
      {
        type: "text",
        delta:
          "\n\n> Cálculo verificado automáticamente en el sandbox. Resultado: `42`.",
      },
      {
        type: "done",
        executionId: "00000000-0000-4000-8000-000000000042",
        profile: "MATH",
        intent: "SOLVE",
      },
    ]);
    expect(prepared.sandboxStatus).toBe("success");
  });

  it("streams the model response and warning when verification fails", async () => {
    const repository = new MemoryRepository();
    const verifier = {
      verify: async () => ({
        status: "sandbox_failed" as const,
        footer:
          "\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
      }),
    };
    const chat = new ChatService(
      repository as never,
      contextualProvider(),
      verifier as never,
    );

    const prepared = await chat.prepare("Calcula 6 * 7");

    await expect(collect(prepared.events)).resolves.toEqual([
      { type: "text", delta: "Respuesta sin verificar." },
      {
        type: "text",
        delta:
          "\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
      },
      expect.objectContaining({ type: "done" }),
    ]);
  });

  it("persists the sandbox status with the completed execution", async () => {
    const repository = new MemoryRepository();
    const chat = new ChatService(
      repository as never,
      contextualProvider(),
      { verify: async () => ({ status: "success" as const }) } as never,
    );

    await chat.complete({
      executionId: "00000000-0000-4000-8000-000000000042",
      conversationId: "00000000-0000-4000-8000-000000000001",
      content: "Respuesta completa",
      profile: "MATH",
      intent: "COMPUTE",
      latencyMs: 25,
      sandboxStatus: "success",
      inputTokens: 12,
      outputTokens: 34,
    });

    expect(repository.executions).toEqual([
      expect.objectContaining({
        inputTokens: 12,
        outputTokens: 34,
        metadata: { sandbox: { status: "success" } },
      }),
    ]);
  });
});
