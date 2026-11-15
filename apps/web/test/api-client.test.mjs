import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientService } from "../src/app/services/api-client.service.ts";

test("sends credentials on every request and CSRF only on unsafe methods", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];
  globalThis.document = { cookie: "emilia_csrf=csrf-token; theme=dark" };
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const client = new ApiClientService();
    await client.request("http://localhost:3000/api/conversations");
    await client.request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    assert.equal(calls[0].init.credentials, "include");
    assert.equal(new Headers(calls[0].init.headers).has("x-csrf-token"), false);
    assert.equal(calls[1].init.credentials, "include");
    assert.equal(new Headers(calls[1].init.headers).get("x-csrf-token"), "csrf-token");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }
});

test("preserves abort signals and does not retry a 401", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let attempts = 0;
  globalThis.fetch = async (_input, init) => {
    attempts += 1;
    assert.equal(init.signal, controller.signal);
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  };

  try {
    const client = new ApiClientService();
    const response = await client.request("http://localhost:3000/api/chat", {
      method: "POST",
      signal: controller.signal,
    });
    assert.equal(response.status, 401);
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
