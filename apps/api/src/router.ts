import type { Intent, Profile } from "@emil-ia/contracts";

export function routePrompt(content: string): {
  intent: Intent;
  profile: Profile;
} {
  const text = content.toLocaleLowerCase();
  const includesAny = (...terms: string[]) =>
    terms.some((term) => text.includes(term));
  const hasMathContext =
    /\d/.test(text) ||
    includesAny(
      "resultado",
      "expresión",
      "expresion",
      "ecuación",
      "ecuacion",
      "función",
      "funcion",
      "integral",
      "derivada",
      "valor",
      "número",
      "numero",
      "operación",
      "operacion",
      "cálculo",
      "calculo",
      "fracción",
      "fraccion",
      "matriz",
      "variable",
      "incógnita",
      "incognita",
      "ejercicio matemático",
      "ejercicio matematico",
    );
  const explicitCalculation =
    includesAny("calcula", "calcular", "resuelve", "resolver") ||
    (hasMathContext &&
      includesAny(
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
      ));
  const intent: Intent =
    includesAny("demuestra", "demostrar", "prueba", "probar")
      ? "PROVE"
      : includesAny("verifica", "verificar", "comprueba", "comprobar")
        ? "VERIFY"
        : includesAny("código", "codigo", "programa")
          ? "CODE"
          : explicitCalculation
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
