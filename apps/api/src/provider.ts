import type { AIEvent, AIRequest } from "@emil-ia/contracts";

export interface AIProvider {
  generate(request: AIRequest): Promise<string | null>;
  stream(request: AIRequest): AsyncIterable<AIEvent>;
}

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
  ) {}

  async generate(request: AIRequest): Promise<string> {
    const response = await this.request(
      request,
      false,
      AbortSignal.timeout(this.planningTimeoutMs),
    );
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Proveedor IA no devolvió contenido");
    }
    return content;
  }

  async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const response = await this.request(request, true);
    if (!response.body) throw new Error("Proveedor IA no devolvió contenido");

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      for (const line of buffer.split("\n")) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) yield { type: "text", delta };
        } catch {
          /* fragmento SSE incompleto */
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    }
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
    };
  }

  private async request(
    request: AIRequest,
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
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
          messages: request.messages,
        }),
        signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Proveedor IA respondió ${response.status}`);
    }
    return response;
  }
}

export function createProvider(): AIProvider {
  return process.env.OPENCODE_API_KEY && process.env.OPENCODE_MODEL
    ? new OpenCodeProvider(
        process.env.OPENCODE_API_KEY,
        process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/api",
        process.env.OPENCODE_MODEL,
      )
    : new MockProvider();
}
