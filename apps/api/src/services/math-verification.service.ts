import type { AIRequest, Intent, Profile } from "@emil-ia/contracts";
import { z } from "zod";
import type {
  MathVerificationResult,
  SandboxStatus,
} from "../interfaces/math-verification.interface.js";
import type { AIProvider } from "../provider.js";
import type { SandboxClient } from "../sandbox.js";

export type {
  MathVerificationResult,
  SandboxStatus,
} from "../interfaces/math-verification.interface.js";

const CalculationPlanSchema = z
  .object({ code: z.string().min(1).max(12000) })
  .strict();

const ResultSchema = z.string().min(1).max(2000);
const VERIFIABLE_INTENTS: ReadonlySet<Intent> = new Set([
  "SOLVE",
  "VERIFY",
  "COMPUTE",
]);

const FAILURE_FOOTER =
  "\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.";
const MOCK_FOOTER =
  "\n\n> La verificación automática requiere un proveedor de IA real configurado.";
const PLANNER_INSTRUCTION =
  'Genera un único cálculo Python para verificar la consulta. Responde solo JSON con la forma {"code":"..."}, sin Markdown. El código debe asignar un resultado breve a la variable result. Usa únicamente sympy, numpy, scipy o matplotlib y no incluyas explicaciones.';

interface VerificationLogger {
  warn(context: { status: SandboxStatus }, message: string): void;
}

type CalculationProvider = Pick<AIProvider, "generate">;
type SandboxRunner = Pick<SandboxClient, "run">;

export class MathVerificationService {
  constructor(
    private readonly provider: CalculationProvider,
    private readonly sandbox: SandboxRunner,
    private readonly logger?: VerificationLogger,
  ) {}

  async verify(
    messages: AIRequest["messages"],
    route: { intent: Intent; profile: Profile },
  ): Promise<MathVerificationResult> {
    if (!VERIFIABLE_INTENTS.has(route.intent)) {
      return { status: "not_applicable" };
    }

    let planText: string | null;
    try {
      planText = await this.provider.generate({
        messages: [
          { role: "system", content: PLANNER_INSTRUCTION },
          ...messages,
        ],
        ...route,
      });
    } catch {
      return this.failure("planning_failed");
    }

    if (planText === null) {
      return { status: "skipped_mock", footer: MOCK_FOOTER };
    }

    const plan = this.parsePlan(planText);
    if (!plan) return this.failure("planning_failed");

    try {
      const execution = await this.sandbox.run({
        code: plan.code,
        timeoutSeconds: 5,
      });
      const parsedResult = ResultSchema.safeParse(execution.variables.result);
      if (!parsedResult.success) return this.failure("sandbox_failed");

      const result = this.sanitizeResult(parsedResult.data);
      if (!result) return this.failure("sandbox_failed");

      return {
        status: "success",
        systemMessage: `Resultado verificado por el sandbox: ${result}. Usa este valor para redactar la respuesta y no menciones el código interno.`,
        footer: `\n\n> Cálculo verificado automáticamente en el sandbox. Resultado: \`${result}\`.`,
      };
    } catch {
      return this.failure("sandbox_failed");
    }
  }

  private parsePlan(value: string): z.infer<typeof CalculationPlanSchema> | null {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = CalculationPlanSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  private sanitizeResult(value: string): string {
    return value.replace(/\s+/g, " ").replace(/`/g, "'").trim();
  }

  private failure(status: "planning_failed" | "sandbox_failed") {
    this.logger?.warn({ status }, "Automatic math verification failed");
    return { status, footer: FAILURE_FOOTER } as const;
  }
}
