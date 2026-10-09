import { afterEach, describe, expect, it, vi } from "vitest";
import { SandboxClient } from "../src/sandbox.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SandboxClient", () => {
  it("rejects a successful response with invalid variables", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, variables: { result: 42 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new SandboxClient("https://sandbox.test");

    await expect(
      client.run({ code: "result = 42", timeoutSeconds: 5 }),
    ).rejects.toThrow("Respuesta inválida del sandbox");
  });
});
