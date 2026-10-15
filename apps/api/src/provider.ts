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

export interface ProviderLogger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export type ProviderErrorCode =
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "invalid_sse"
  | "empty_response"
  | "upstream_error"
  | "stream_incomplete"
  | "unknown";

class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const DEFAULT_BASE_URL = "https://opencode.ai/inference/go/v1";
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
    private readonly logger?: ProviderLogger,
  ) {}

  async generate(request: AIRequest): Promise<string> {
    const trackedRequest = this.withSession(request);
    const startedAt = Date.now();
    let clearTimeout = () => {};
    try {
      const result = await this.request(
        trackedRequest,
        false,
        this.planningTimeoutMs,
        true,
      );
      clearTimeout = result.clearTimeout;
      try {
        const body = (await result.response.json()) as {
          choices?: Array<{ message?: { content?: unknown } }>;
        };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw new ProviderError(
            "Proveedor IA no devolvió contenido",
            "empty_response",
          );
        }
        this.logSuccess(trackedRequest, startedAt);
        return content;
      } finally {
        clearTimeout();
      }
    } catch (error) {
      this.logFailure(trackedRequest, startedAt, error);
      throw error;
    }
  }

  async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const trackedRequest = this.withSession(request);
    const startedAt = Date.now();
    let reader: ReadableStreamDefaultReader<string> | undefined;
    try {
      const { response } = await this.request(
        trackedRequest,
        true,
        this.options.connectTimeoutMs,
      );
      if (!response.body) {
        throw new ProviderError(
          "Proveedor IA no devolvió contenido",
          "empty_response",
        );
      }

      reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();

      let buffer = "";
      let sawDone = false;
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;

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
          if (payload.error !== undefined) {
            throw new ProviderError(
              "Proveedor IA devolvió un error",
              "upstream_error",
            );
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

      if (!sawDone) {
        throw new ProviderError(
          "Proveedor IA terminó sin [DONE]",
          "stream_incomplete",
        );
      }
      this.logSuccess(trackedRequest, startedAt, inputTokens, outputTokens);
      yield {
        type: "done",
        executionId: crypto.randomUUID(),
        profile: request.profile,
        intent: request.intent,
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      this.logFailure(trackedRequest, startedAt, error);
      throw error;
    } finally {
      if (reader) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the provider error instead of replacing it with cleanup failure.
        }
        reader.releaseLock();
      }
    }
  }

  private withSession(request: AIRequest): AIRequest {
    return { ...request, sessionId: request.sessionId ?? crypto.randomUUID() };
  }

  private logSuccess(
    request: AIRequest,
    startedAt: number,
    inputTokens?: number,
    outputTokens?: number,
  ): void {
    this.logger?.info(
      {
        provider: "opencode",
        model: this.model,
        sessionId: request.sessionId,
        profile: request.profile,
        intent: request.intent,
        durationMs: Date.now() - startedAt,
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
      },
      "Provider request completed",
    );
  }

  private logFailure(
    request: AIRequest,
    startedAt: number,
    error: unknown,
  ): void {
    const classification = classifyProviderError(error);
    this.logger?.error(
      {
        provider: "opencode",
        model: this.model,
        sessionId: request.sessionId,
        profile: request.profile,
        intent: request.intent,
        durationMs: Date.now() - startedAt,
        code: classification.code,
        ...(classification.httpStatus === undefined
          ? {}
          : { httpStatus: classification.httpStatus }),
      },
      "Provider request failed",
    );
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
            "user-agent": "emil-ia/0.1.0",
            "x-opencode-session": request.sessionId ?? crypto.randomUUID(),
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
        throw new ProviderError(
          `Proveedor IA respondió ${response.status}`,
          response.status === 429 ? "rate_limited" : "http_error",
          response.status,
        );
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
      throw new ProviderError(
        "Proveedor IA devolvió SSE inválido",
        "invalid_sse",
      );
    }
  }
}

function classifyProviderError(error: unknown): {
  code: ProviderErrorCode;
  httpStatus?: number;
} {
  if (error instanceof ProviderError) {
    return { code: error.code, httpStatus: error.httpStatus };
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /timeout|tiempo de inactividad/i.test(error.message))
  ) {
    return { code: "timeout" };
  }
  return { code: "unknown" };
}

export function createProvider(logger?: ProviderLogger): AIProvider {
  return process.env.OPENCODE_API_KEY && process.env.OPENCODE_MODEL
    ? new OpenCodeProvider(
        process.env.OPENCODE_API_KEY,
        process.env.OPENCODE_BASE_URL || DEFAULT_BASE_URL,
        process.env.OPENCODE_MODEL,
        10000,
        {
          connectTimeoutMs:
            readBoundedSeconds("OPENCODE_CONNECT_TIMEOUT_SECONDS", 15, 1, 60) *
            1000,
          idleTimeoutMs:
            readBoundedSeconds(
              "OPENCODE_STREAM_IDLE_TIMEOUT_SECONDS",
              60,
              5,
              300,
            ) * 1000,
          maxTokens: readBoundedInteger("OPENCODE_MAX_TOKENS", 2048, 128, 8192),
        },
        logger,
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
