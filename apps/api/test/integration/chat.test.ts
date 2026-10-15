import { afterEach, expect, it } from "vitest";
import type { AIRequest } from "@emil-ia/contracts";
import type { AIProvider } from "../../src/provider.js";
import { createIntegrationApp } from "./fixture.js";

let fixture: Awaited<ReturnType<typeof createIntegrationApp>> | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const provider: AIProvider = {
  async generate() {
    return '{"code":"result = 6 * 7"}';
  },
  async *stream(request) {
    yield { type: "text", delta: "42" };
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
      inputTokens: 12,
      outputTokens: 3,
    };
  },
};

function contextualProvider(requests: AIRequest[]): AIProvider {
  return {
    async generate() {
      return null;
    },
    async *stream(request) {
      requests.push({ ...request, messages: [...request.messages] });
      const hasPreviousAnswer = request.messages.some(
        (message) =>
          message.role === "assistant" && message.content === "Primer resultado",
      );
      yield {
        type: "text",
        delta: hasPreviousAnswer ? "Respuesta con contexto" : "Primer resultado",
      };
      yield {
        type: "done",
        executionId: crypto.randomUUID(),
        profile: request.profile,
        intent: request.intent,
      };
    },
  };
}

it("persists a sandbox-verified answer that can be retrieved through history", async () => {
  fixture = await createIntegrationApp(provider);
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Calcula 6 * 7" },
  });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("event: done");
  expect(response.body).not.toContain("event: error");
  expect(response.body).toContain('"inputTokens":12');
  const history = await fixture.app.inject({
    url: `/api/conversations/${response.headers["x-conversation-id"]}/messages`,
  });
  expect(history.statusCode).toBe(200);
  expect(history.json()).toEqual([
    { role: "user", content: "Calcula 6 * 7" },
    {
      role: "assistant",
      content:
        "42\n\n> Cálculo verificado automáticamente en el sandbox. Resultado: `42`.",
    },
  ]);
  const analytics = await fixture.app.inject({ url: "/api/analytics/summary" });
  expect(analytics.json()).toMatchObject({
    conversations: 1,
    messages: 2,
    executions: 1,
  });
});

it("keeps a warning in history when the real sandbox rejects the plan", async () => {
  fixture = await createIntegrationApp({
    ...provider,
    async generate() {
      return '{"code":"import os\\nresult = 42"}';
    },
  });
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Calcula 6 * 7" },
  });
  expect(response.body).toContain("event: done");
  const history = await fixture.app.inject({
    url: `/api/conversations/${response.headers["x-conversation-id"]}/messages`,
  });
  expect(history.json()).toEqual([
    { role: "user", content: "Calcula 6 * 7" },
    {
      role: "assistant",
      content:
        "42\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
    },
  ]);
});

it("does not save a partial assistant answer or execution when the provider fails", async () => {
  fixture = await createIntegrationApp({
    ...provider,
    async *stream() {
      yield { type: "text", delta: "Respuesta incompleta" };
      throw new Error("Provider connection interrupted");
    },
  });
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica un vector" },
  });
  expect(response.body).toContain("Respuesta incompleta");
  expect(response.body).toContain("event: error");
  expect(response.body).not.toContain("event: done");
  const history = await fixture.app.inject({
    url: `/api/conversations/${response.headers["x-conversation-id"]}/messages`,
  });
  expect(history.json()).toEqual([
    { role: "user", content: "Explica un vector" },
  ]);
  const analytics = await fixture.app.inject({ url: "/api/analytics/summary" });
  expect(analytics.json()).toMatchObject({
    conversations: 1,
    messages: 1,
    executions: 0,
  });
});

it("reconstructs conversation context after history is loaded again", async () => {
  const requests: AIRequest[] = [];
  fixture = await createIntegrationApp(contextualProvider(requests));

  const first = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica la idea principal" },
  });
  const conversationId = first.headers["x-conversation-id"];

  const history = await fixture.app.inject({
    url: `/api/conversations/${conversationId}/messages`,
  });
  expect(history.json()).toEqual([
    { role: "user", content: "Explica la idea principal" },
    { role: "assistant", content: "Primer resultado" },
  ]);

  const followUp = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId,
      content: "Ahora resume esa respuesta",
    },
  });

  expect(followUp.statusCode).toBe(200);
  expect(followUp.body).toContain('"delta":"Respuesta con contexto"');
  expect(followUp.body).toContain("event: done");
  expect(requests[1].messages).toEqual([
    { role: "user", content: "Explica la idea principal" },
    { role: "assistant", content: "Primer resultado" },
    { role: "user", content: "Ahora resume esa respuesta" },
  ]);
});

it("keeps provider context isolated between conversations", async () => {
  const requests: AIRequest[] = [];
  fixture = await createIntegrationApp(contextualProvider(requests));

  const firstConversation = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica el concepto A" },
  });
  const firstId = firstConversation.headers["x-conversation-id"];

  const secondConversation = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica el concepto B" },
  });
  const secondId = secondConversation.headers["x-conversation-id"];

  await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId: firstId,
      content: "Compara con el concepto inicial",
    },
  });

  expect(firstId).not.toBe(secondId);
  expect(requests[2].messages).toEqual([
    { role: "user", content: "Explica el concepto A" },
    { role: "assistant", content: "Primer resultado" },
    { role: "user", content: "Compara con el concepto inicial" },
  ]);
  expect(requests[2].messages).not.toContainEqual({
    role: "user",
    content: "Explica el concepto B",
  });
});
