import type { AIRequest } from "@emil-ia/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProvider,
  MockProvider,
  OpenCodeProvider,
} from "../src/provider.js";

const REQUEST: AIRequest = {
  sessionId: "00000000-0000-4000-8000-000000000042",
  messages: [{ role: "user", content: "Calcula 2 + 2" }],
  profile: "MATH",
  intent: "COMPUTE",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function collect(provider: OpenCodeProvider) {
  const events = [];
  for await (const event of provider.stream(REQUEST)) events.push(event);
  return events;
}

function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) {
          controller.enqueue(encoder.encode(chunk));
        } else {
          controller.close();
        }
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

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
        headers: expect.objectContaining({
          authorization: "Bearer secret",
          "content-type": "application/json",
          "user-agent": "emil-ia/0.1.0",
          "x-opencode-session": REQUEST.sessionId,
        }),
        body: JSON.stringify({
          model: "math-model",
          stream: false,
          max_tokens: 2048,
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

  it("aborts a planning request that exceeds its deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        });
      }),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      5,
    );

    await expect(provider.generate(REQUEST)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("uses the Go endpoint and safe defaults for invalid environment limits", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "secret");
    vi.stubEnv("OPENCODE_MODEL", "math-model");
    vi.stubEnv("OPENCODE_BASE_URL", "");
    vi.stubEnv("OPENCODE_MAX_TOKENS", "invalid");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(["data: [DONE]\n\n"])),
    );

    const provider = createProvider();
    const events = [];
    for await (const event of provider.stream(REQUEST)) events.push(event);

    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(fetch).toHaveBeenCalledWith(
      "https://opencode.ai/inference/go/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-opencode-session": REQUEST.sessionId,
          "user-agent": "emil-ia/0.1.0",
        }),
        body: JSON.stringify({
          model: "math-model",
          stream: true,
          max_tokens: 2048,
          stream_options: { include_usage: true },
          messages: REQUEST.messages,
        }),
      }),
    );
  });

  it("preserves fragmented text and emits provider usage on done", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamingResponse([
            'data: {"choices":[{"delta":{"content":"Hel',
            'lo"}}]}\n\n',
            'data: {"usage":{"prompt_tokens":3,"completion_tokens":5}}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
    );

    await expect(collect(provider)).resolves.toEqual([
      { type: "text", delta: "Hello" },
      expect.objectContaining({
        type: "done",
        inputTokens: 3,
        outputTokens: 5,
      }),
    ]);
  });

  it("emits structured success telemetry without logging prompt content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamingResponse([
            'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
            'data: {"usage":{"prompt_tokens":3,"completion_tokens":5}}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await collect(provider);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "opencode",
        model: "math-model",
        sessionId: REQUEST.sessionId,
        profile: "MATH",
        intent: "COMPUTE",
        durationMs: expect.any(Number),
        inputTokens: 3,
        outputTokens: 5,
      }),
      "Provider request completed",
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      "Calcula 2 + 2",
    );
  });

  it("classifies rate limits in structured failure telemetry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("too many requests", { status: 429 }),
      ),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow(
      "Proveedor IA respondió 429",
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "opencode",
        model: "math-model",
        sessionId: REQUEST.sessionId,
        profile: "MATH",
        intent: "COMPUTE",
        code: "rate_limited",
        httpStatus: 429,
        durationMs: expect.any(Number),
      }),
      "Provider request failed",
    );
  });

  it("classifies other HTTP failures separately from rate limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("service unavailable", { status: 503 }),
      ),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "http_error", httpStatus: 503 }),
      "Provider request failed",
    );
  });

  it("classifies malformed SSE payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(["data: invalid-json\n\n"])),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "invalid_sse" }),
      "Provider request failed",
    );
  });

  it("classifies an empty provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "empty_response" }),
      "Provider request failed",
    );
  });

  it("classifies upstream provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamingResponse([
          'data: {"error":{"message":"upstream detail"}}\n\n',
        ]),
      ),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "upstream_error" }),
      "Provider request failed",
    );
  });

  it("classifies a stream that ends before the done marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamingResponse([
          'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
        ]),
      ),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 60, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "stream_incomplete" }),
      "Provider request failed",
    );
  });

  it("accepts an SSE CRLF delimiter split across chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamingResponse([
            'data: {"choices":[{"delta":{"content":"Hola"}}]}\r',
            "\n\r\n",
            "data: [DONE]\r\n\r\n",
          ]),
        ),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
    );

    await expect(collect(provider)).resolves.toEqual([
      { type: "text", delta: "Hola" },
      expect.objectContaining({ type: "done" }),
    ]);
  });

  it("cancels an open stream after receiving [DONE]", async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
    );

    await collect(provider);

    expect(cancelled).toBe(true);
  });

  it("keeps the planning deadline while its response body is pending", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return Promise.resolve({
          ok: true,
          json: () => new Promise(() => {}),
        } as Response);
      }),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      5,
    );

    void provider.generate(REQUEST);
    await vi.advanceTimersByTimeAsync(5);

    expect(signal?.aborted).toBe(true);
  });

  it("rejects an upstream SSE error instead of completing the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamingResponse([
            'data: {"error":{"message":"upstream detail"}}\n\n',
          ]),
        ),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
    );

    await expect(collect(provider)).rejects.toThrow(
      "Proveedor IA devolvió un error",
    );
  });

  it("aborts a stream whose connection exceeds the configured deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        if (!init.signal) throw new Error("missing connection deadline");
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        });
      }),
    );
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 5, idleTimeoutMs: 60, maxTokens: 2048 },
    );

    await expect(collect(provider)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("aborts a stream that stays idle after connecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(new ReadableStream({ start() {} }), { status: 200 }),
        ),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const provider = new OpenCodeProvider(
      "secret",
      "https://example.test/v1",
      "math-model",
      10000,
      { connectTimeoutMs: 60, idleTimeoutMs: 5, maxTokens: 2048 },
      logger,
    );

    await expect(collect(provider)).rejects.toThrow(
      "Proveedor IA agotó el tiempo de inactividad",
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "timeout" }),
      "Provider request failed",
    );
  }, 100);
});
