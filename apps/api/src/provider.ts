import type { AIEvent, AIRequest } from "@emil-ia/contracts";

export interface AIProvider {
  generate(request: AIRequest): Promise<string | null>;
  stream(request: AIRequest): AsyncIterable<AIEvent>;
}

export interface OpenCodeProviderOptions {
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  maxTokens: number;
}

const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_OPTIONS: OpenCodeProviderOptions = {
  connectTimeoutMs: 15000,
  idleTimeoutMs: 60000,
  maxTokens: 2048,
};

export class MockProvider implements AIProvider {
  async generate(_request: AIRequest): Promise<null> {
    return null;
  }

  async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const answer = `Perfil **${request.profile}**.\n\nHe recibido tu consulta y la abordaré como **${request.intent}**.\n\n> Proveedor mock activo: configura OPENCODE_API_KEY para usar el modelo real.`;
    for (const chunk of answer.match(/.{1,32}/gs) ?? []) {
      yield { type: "text", delta: chunk };
      await new Promise((r) => setTimeout(r, 5));
    }
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
    };
  }
}

export class OpenCodeProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly planningTimeoutMs = 10000,
    private readonly options: OpenCodeProviderOptions = DEFAULT_OPTIONS,
  ) {}

  async generate(request: AIRequest): Promise<string> {
    const { response, clearTimeout } = await this.request(
      request,
      false,
      this.planningTimeoutMs,
      true,
    );
    try {
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Proveedor IA no devolvió contenido");
      }
      return content;
    } finally {
      clearTimeout();
    }
  }

  async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const { response } = await this.request(
      request,
      true,
      this.options.connectTimeoutMs,
    );
    if (!response.body) throw new Error("Proveedor IA no devolvió contenido");

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = "";
    let sawDone = false;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      while (!sawDone) {
        const { value, done } = await this.readWithIdleTimeout(reader);
        if (done) break;

        buffer += value;
        buffer = buffer.replace(/\r\n/g, "\n");
        const records = buffer.split("\n\n");
        buffer = records.pop() ?? "";

        for (const record of records) {
          const data = record
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          if (data === "[DONE]") {
            sawDone = true;
            break;
          }

          const payload = this.parseSsePayload(data);
          if (this.isProviderError(payload)) {
            throw new Error("Proveedor IA devolvió un error");
          }
          if (typeof payload.usage?.prompt_tokens === "number") {
            inputTokens = payload.usage.prompt_tokens;
          }
          if (typeof payload.usage?.completion_tokens === "number") {
            outputTokens = payload.usage.completion_tokens;
          }
          const delta = payload.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            yield { type: "text", delta };
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Preserve the provider error instead of replacing it with cleanup failure.
      }
      reader.releaseLock();
    }

    if (!sawDone) throw new Error("Proveedor IA terminó sin [DONE]");
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
      inputTokens,
      outputTokens,
    };
  }

  private async request(
    request: AIRequest,
    stream: boolean,
    timeoutMs: number,
    keepTimeoutUntilBodyRead = false,
  ): Promise<{ response: Response; clearTimeout: () => void }> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException("Timeout", "TimeoutError")),
      timeoutMs,
    );
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            stream,
            max_tokens: this.options.maxTokens,
            ...(stream ? { stream_options: { include_usage: true } } : {}),
            messages: request.messages,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`Proveedor IA respondió ${response.status}`);
      }
      const clearRequestTimeout = () => clearTimeout(timer);
      if (!keepTimeoutUntilBodyRead) clearRequestTimeout();
      return { response, clearTimeout: clearRequestTimeout };
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  private async readWithIdleTimeout(
    reader: ReadableStreamDefaultReader<string>,
  ): Promise<ReadableStreamReadResult<string>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("Proveedor IA agotó el tiempo de inactividad"));
          void reader.cancel();
          }, this.options.idleTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private parseSsePayload(data: string): {
    choices?: Array<{ delta?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    error?: unknown;
  } {
    try {
      return JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        error?: unknown;
      };
    } catch {
      throw new Error("Proveedor IA devolvió SSE inválido");
    }
  }

  private isProviderError(payload: { error?: unknown }): boolean {
    return payload.error !== undefined;
  }
}

export function createProvider(): AIProvider {
  return process.env.OPENCODE_API_KEY && process.env.OPENCODE_MODEL
    ? new OpenCodeProvider(
        process.env.OPENCODE_API_KEY,
        process.env.OPENCODE_BASE_URL || DEFAULT_BASE_URL,
        process.env.OPENCODE_MODEL,
        10000,
        {
          connectTimeoutMs: readBoundedSeconds(
            "OPENCODE_CONNECT_TIMEOUT_SECONDS",
            15,
            1,
            60,
          ) * 1000,
          idleTimeoutMs: readBoundedSeconds(
            "OPENCODE_STREAM_IDLE_TIMEOUT_SECONDS",
            60,
            5,
            300,
          ) * 1000,
          maxTokens: readBoundedInteger("OPENCODE_MAX_TOKENS", 2048, 128, 8192),
        },
      )
    : new MockProvider();
}

function readBoundedSeconds(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return readBoundedInteger(name, fallback, min, max);
}

function readBoundedInteger(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}
