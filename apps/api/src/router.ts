import type { Intent, Profile } from "@emil-ia/contracts";

export function routePrompt(content: string): {
  intent: Intent;
  profile: Profile;
} {
  const text = content.toLocaleLowerCase();
  const includesAny = (...terms: string[]) =>
    terms.some((term) => text.includes(term));
  const intent: Intent =
    includesAny("demuestra", "demostrar", "prueba", "probar")
      ? "PROVE"
      : includesAny("verifica", "verificar", "comprueba", "comprobar")
        ? "VERIFY"
        : includesAny("código", "codigo", "programa")
          ? "CODE"
          : includesAny(
                "calcula",
                "calcular",
                "resuelve",
                "resolver",
                "evalúa",
                "evalua",
                "evaluar",
                "obtén",
                "obten",
                "obtener el valor",
                "determina",
                "determinar",
                "cuánto",
                "cuanto",
              )
            ? "SOLVE"
            : includesAny("resume", "resumir")
              ? "SUMMARIZE"
              : includesAny("explica", "explicar", "qué es", "que es")
                ? "EXPLAIN"
                : "EXPLAIN";
  const profile: Profile = ["PROVE", "VERIFY", "SOLVE", "COMPUTE"].includes(
    intent,
  )
    ? "MATH"
    : intent === "SUMMARIZE"
      ? "FAST"
      : "DEFAULT";
  return { intent, profile };
}
