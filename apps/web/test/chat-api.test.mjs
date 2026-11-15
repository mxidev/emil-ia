import assert from "node:assert/strict";
import test from "node:test";
import { ChatApiService } from "../src/app/services/chat-api.service.ts";
import { readApiError } from "../src/app/services/api-error.ts";

test("reads the structured error field from an API response", async () => {
  const response = new Response(JSON.stringify({ error: "PDF demasiado grande" }), {
    status: 413,
    headers: { "content-type": "application/json" },
  });

  assert.equal(await readApiError(response), "PDF demasiado grande");
});

test("reads the structured message field from an API response", async () => {
  const response = new Response(JSON.stringify({ message: "Conversación no encontrada" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

  assert.equal(await readApiError(response), "Conversación no encontrada");
});

test("falls back to the HTTP status when the API error body is unusable", async () => {
  const response = new Response("not json", { status: 502 });

  assert.equal(await readApiError(response), "La API respondió 502");
});

test("passes the abort signal to the streaming request", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let receivedSignal;
  globalThis.fetch = async (_input, init) => {
    receivedSignal = init.signal;
    return new Response(
      'event: token\ndata: {"delta":"Hola"}\n\n',
      {
        status: 200,
        headers: { "x-conversation-id": "conversation-1" },
      },
    );
  };

  try {
    const tokens = [];
    const result = await new ChatApiService().stream(
      { content: "Hola" },
      {
        onToken: (token) => tokens.push(token),
        onError: () => {},
      },
      controller.signal,
    );

    assert.equal(receivedSignal, controller.signal);
    assert.deepEqual(tokens, ["Hola"]);
    assert.equal(result.conversationId, "conversation-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
