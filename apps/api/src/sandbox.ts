import { z } from "zod";

export const SandboxRequestSchema = z.object({
  code: z.string().min(1).max(12000),
  timeoutSeconds: z.number().int().min(1).max(10).default(5),
});

export type SandboxRequest = z.infer<typeof SandboxRequestSchema>;

export const SandboxResponseSchema = z.object({
  ok: z.literal(true),
  variables: z.record(z.string()),
});
export type SandboxResponse = z.infer<typeof SandboxResponseSchema>;

export class SandboxClient {
  constructor(
    private readonly baseUrl = process.env.SANDBOX_URL ??
      "http://localhost:8001",
  ) {}

  async run(request: SandboxRequest): Promise<SandboxResponse> {
    const response = await fetch(`${this.baseUrl}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: request.code,
        timeout_seconds: request.timeoutSeconds,
      }),
      signal: AbortSignal.timeout((request.timeoutSeconds + 2) * 1000),
    });

    const body: unknown = await response
      .json()
      .catch(() => ({ detail: "Respuesta inválida del sandbox" }));

    if (!response.ok) {
      throw new Error(
        this.hasDetail(body)
          ? body.detail
          : `Sandbox respondió ${response.status}`,
      );
    }

    const parsed = SandboxResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error("Respuesta inválida del sandbox");
    return parsed.data;
  }

  private hasDetail(body: unknown): body is { detail: string } {
    return (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    );
  }
}
