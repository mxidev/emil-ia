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
    return '{"code":"result = 42"}';
  },
  async *stream(request) {
    yield { type: "text", delta: "42" };
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
    };
  },
};

it("does not expose one student's conversation to another authenticated student", async () => {
  fixture = await createIntegrationApp(provider);

  const ownerResponse = await fixture.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica una ecuación" },
  });
  expect(ownerResponse.statusCode).toBe(200);
  const conversationId = ownerResponse.headers["x-conversation-id"];

  const foreignHistory = await fixture.injectAsSecondUser({
    method: "GET",
    url: `/api/conversations/${conversationId}/messages`,
  });
  const foreignExport = await fixture.injectAsSecondUser({
    method: "GET",
    url: `/api/conversations/${conversationId}/export.md`,
  });
  const foreignFeedback = await fixture.injectAsSecondUser({
    method: "POST",
    url: `/api/conversations/${conversationId}/feedback`,
    payload: { rating: "positive" },
  });
  const foreignChat = await fixture.injectAsSecondUser({
    method: "POST",
    url: "/api/chat",
    payload: { conversationId, content: "Intenta modificarla" },
  });
  const secondHistory = await fixture.injectAsSecondUser({
    method: "GET",
    url: "/api/conversations",
  });

  expect(foreignHistory.statusCode).toBe(404);
  expect(foreignExport.statusCode).toBe(404);
  expect(foreignFeedback.statusCode).toBe(404);
  expect(foreignChat.statusCode).toBe(404);
  expect(secondHistory.json()).toEqual([]);
});
