import type { Intent, Profile } from "@emil-ia/contracts";

export function routePrompt(content: string): {
  intent: Intent;
  profile: Profile;
} {
  const text = content.toLocaleLowerCase();
  const intent: Intent =
    text.includes("demuestra") || text.includes("prueba")
      ? "PROVE"
      : text.includes("verifica") || text.includes("comprueba")
        ? "VERIFY"
        : text.includes("código") || text.includes("programa")
          ? "CODE"
          : text.includes("calcula") || text.includes("resuelve")
            ? "SOLVE"
            : text.includes("resume") || text.includes("resumir")
              ? "SUMMARIZE"
              : text.includes("explica") || text.includes("qué es")
                ? "EXPLAIN"
                : "COMPUTE";
  const profile: Profile = ["PROVE", "VERIFY", "SOLVE", "COMPUTE"].includes(
    intent,
  )
    ? "MATH"
    : intent === "SUMMARIZE"
      ? "FAST"
      : "DEFAULT";
  return { intent, profile };
}
