import type { AIRequest } from "@emil-ia/contracts";
import { describe, expect, it } from "vitest";
import { MathVerificationService } from "../src/services/math-verification.service.js";

const MESSAGES: AIRequest["messages"] = [
  { role: "user", content: "Calcula 6 * 7" },
];

function providerReturning(value: string | null) {
  return { generate: async () => value };
}

function sandboxReturning(variables: Record<string, string>) {
  return { run: async () => ({ ok: true as const, variables }) };
}

describe("MathVerificationService", () => {
  it("does not verify non-mathematical intents", async () => {
    const service = new MathVerificationService(
      { generate: async () => Promise.reject(new Error("must not run")) },
      { run: async () => Promise.reject(new Error("must not run")) },
    );

    await expect(
      service.verify(MESSAGES, { intent: "EXPLAIN", profile: "DEFAULT" }),
    ).resolves.toEqual({ status: "not_applicable" });
  });

  it("returns verified context and a safe result footer", async () => {
    const service = new MathVerificationService(
      providerReturning('{"code":"result = 6 * 7"}'),
      sandboxReturning({ result: "42" }),
    );

    const result = await service.verify(MESSAGES, {
      intent: "COMPUTE",
      profile: "MATH",
    });

    expect(result).toEqual({
      status: "success",
      systemMessage:
        "Resultado verificado por el sandbox: 42. Usa este valor para redactar la respuesta y no menciones el código interno.",
      footer:
        "\n\n> Cálculo verificado automáticamente en el sandbox. Resultado: `42`.",
    });
  });

  it("reports that mock generation cannot verify the calculation", async () => {
    const service = new MathVerificationService(
      providerReturning(null),
      sandboxReturning({ result: "unused" }),
    );

    await expect(
      service.verify(MESSAGES, { intent: "SOLVE", profile: "MATH" }),
    ).resolves.toEqual({
      status: "skipped_mock",
      footer:
        "\n\n> La verificación automática requiere un proveedor de IA real configurado.",
    });
  });

  it("rejects planner output that is not a raw JSON plan", async () => {
    const service = new MathVerificationService(
      providerReturning('```json\n{"code":"result = 42"}\n```'),
      sandboxReturning({ result: "unused" }),
    );

    await expect(
      service.verify(MESSAGES, { intent: "VERIFY", profile: "MATH" }),
    ).resolves.toEqual({
      status: "planning_failed",
      footer:
        "\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
    });
  });

  it("degrades to a warning when the sandbox fails", async () => {
    const service = new MathVerificationService(
      providerReturning('{"code":"result = 42"}'),
      { run: async () => Promise.reject(new Error("internal detail")) },
    );

    await expect(
      service.verify(MESSAGES, { intent: "COMPUTE", profile: "MATH" }),
    ).resolves.toEqual({
      status: "sandbox_failed",
      footer:
        "\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
    });
  });

  it.each([
    ["missing", {}],
    ["oversized", { result: "x".repeat(2001) }],
  ])("rejects a %s sandbox result", async (_case, variables) => {
    const service = new MathVerificationService(
      providerReturning('{"code":"result = 42"}'),
      sandboxReturning(variables),
    );

    await expect(
      service.verify(MESSAGES, { intent: "COMPUTE", profile: "MATH" }),
    ).resolves.toEqual({
      status: "sandbox_failed",
      footer:
        "\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
    });
  });
});
