import { z } from "zod";

export const SandboxRequestSchema = z.object({
  code: z.string().min(1).max(12000),
  timeoutSeconds: z.number().int().min(1).max(10).default(5),
});

export type SandboxRequest = z.infer<typeof SandboxRequestSchema>;

export class SandboxClient {
  constructor(
    private readonly baseUrl = process.env.SANDBOX_URL ??
      "http://localhost:8001",
  ) {}

  async run(request: SandboxRequest) {
    const response = await fetch(`${this.baseUrl}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: request.code,
        timeout_seconds: request.timeoutSeconds,
      }),
      signal: AbortSignal.timeout((request.timeoutSeconds + 2) * 1000),
    });

    const body = await response
      .json()
      .catch(() => ({ detail: "Respuesta inválida del sandbox" }));
    
      if (!response.ok)
      throw new Error(
        typeof body.detail === "string"
          ? body.detail
          : `Sandbox respondió ${response.status}`,
      );
    
    return body as { ok: boolean; variables: Record<string, string> };
  }
}
