import type { AIRequest } from "@emil-ia/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockProvider, OpenCodeProvider } from "../src/provider.js";

const REQUEST: AIRequest = {
  messages: [{ role: "user", content: "Calcula 2 + 2" }],
  profile: "MATH",
  intent: "COMPUTE",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider generation", () => {
  it("reports unavailable generation for the mock provider", async () => {
    const provider = new MockProvider();

    await expect(provider.generate(REQUEST)).resolves.toBeNull();
  });

  it("requests a non-streaming completion and returns its text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"code":"result = 4"}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1/",
      "math-model",
    );

    await expect(provider.generate(REQUEST)).resolves.toBe(
      '{"code":"result = 4"}',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "math-model",
          stream: false,
          messages: REQUEST.messages,
        }),
      }),
    );
  });

  it("rejects a successful response without assistant text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: {} }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
    );

    await expect(provider.generate(REQUEST)).rejects.toThrow(
      "Proveedor IA no devolvió contenido",
    );
  });
});
