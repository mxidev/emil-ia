import type { AIEvent, AIRequest } from "@emil-ia/contracts";
import type { ModelExecutionRecord } from "../src/interfaces/persistence.interface.js";
import type { AIProvider } from "../src/provider.js";
import { describe, expect, it } from "vitest";
import { ChatService } from "../src/services/chat.service.js";
import { MathVerificationService } from "../src/services/math-verification.service.js";
import { AttachmentNotFoundError } from "../src/services/attachment.service.js";

const conversationId = "00000000-0000-4000-8000-000000000001";

class MemoryRepository {
  readonly executions: ModelExecutionRecord[] = [];
  readonly messages: Array<{ role: "user" | "assistant"; content: string }> =
    [];

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
  it("does not persist a user message when attachment access fails", async () => {
    const repository = new MemoryRepository();
    const chat = new ChatService(
      repository,
      contextualProvider(),
      { verify: async () => ({ status: "not_applicable" as const }) },
      {
        getContext: async () => {
          throw new AttachmentNotFoundError("Attachment not found in conversation");
        },
      },
    );

    await expect(
      chat.prepare("Resume el PDF", conversationId, [
        "00000000-0000-4000-8000-000000000002",
      ]),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
    expect(repository.messages).toEqual([]);
  });

  it("includes selected PDF context in verification and provider messages", async () => {
    const verificationMessages: AIRequest["messages"][] = [];
    const providerRequests: AIRequest[] = [];
    const attachmentContext = {
      getContext: async () => [
        {
          role: "system" as const,
          content: "Document reference: método de Euler",
        },
      ],
    };
    const provider: AIProvider = {
      generate: async () => null,
      async *stream(request) {
        providerRequests.push(request);
        yield {
          type: "done",
          executionId: crypto.randomUUID(),
          profile: request.profile,
          intent: request.intent,
        };
      },
    };
    const verifier = {
      verify: async (messages: AIRequest["messages"]) => {
        verificationMessages.push(messages);
        return { status: "not_applicable" as const };
      },
    };
    const chat = new ChatService(
      new MemoryRepository(),
      provider,
      verifier,
      attachmentContext,
    );

    const prepared = await chat.prepare(
      "Resume el método",
      conversationId,
      ["00000000-0000-4000-8000-000000000002"],
    );
    await collect(prepared.events);

    expect(verificationMessages[0]).toContainEqual({
      role: "system",
      content: "Document reference: método de Euler",
    });
    expect(providerRequests[0].messages).toContainEqual({
      role: "system",
      content: "Document reference: método de Euler",
    });
  });

  it("shares the conversation session across planning, streaming and follow-ups", async () => {
    const requests: AIRequest[] = [];
    const provider: AIProvider = {
      async generate(request) {
        requests.push(request);
        return '{"code":"result = 42"}';
      },
      async *stream(request) {
        requests.push(request);
        yield {
          type: "done",
          executionId: crypto.randomUUID(),
          profile: request.profile,
          intent: request.intent,
        };
      },
    };
    const verifier = new MathVerificationService(provider, {
      run: async () => ({ ok: true, variables: { result: "42" } }),
    });
    const chat = new ChatService(new MemoryRepository(), provider, verifier);
    const first = await chat.prepare("Calcula 6 * 7");
    await collect(first.events);
    const next = await chat.prepare("Calcula 6 * 7", first.conversationId);
    await collect(next.events);
    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(request).toMatchObject({ sessionId: first.conversationId });
    }
    const separate = await chat.prepare("Calcula 6 * 7");
    await collect(separate.events);
    expect(separate.conversationId).not.toBe(first.conversationId);
    expect(requests.at(-1)).toMatchObject({
      sessionId: separate.conversationId,
    });
  });
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
    const chat = new ChatService(repository as never, contextualProvider(), {
      verify: async () => ({ status: "success" as const }),
    } as never);

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
