import { afterEach, expect, it } from "vitest";
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
