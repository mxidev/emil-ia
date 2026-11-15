import { describe, expect, it } from "vitest";
import { routePrompt } from "../src/router.js";
describe("router académico", () => {
  
  it("clasifica demostraciones como MATH/PROVE", () =>
    expect(routePrompt("Demuestra que f es continua")).toEqual({
      intent: "PROVE",
      profile: "MATH",
    }));
  
  it("clasifica resúmenes como FAST", () =>
    expect(routePrompt("Resume este texto")).toEqual({
      intent: "SUMMARIZE",
      profile: "FAST",
    }));

  it("uses a neutral explanation fallback for general questions", () =>
    expect(routePrompt("¿Por qué se usa un autovalor?")).toEqual({
      intent: "EXPLAIN",
      profile: "DEFAULT",
    }));

  it("classifies explicit calculation variants as verifiable math", () =>
    expect(routePrompt("Evalúa este resultado")).toEqual({
      intent: "SOLVE",
      profile: "MATH",
    }));

  it.each([
    "Evalúa la situación del proyecto",
    "Determina la situación del proyecto",
  ])("does not treat general evaluation as calculation: %s", (prompt) =>
    expect(routePrompt(prompt)).toEqual({
      intent: "EXPLAIN",
      profile: "DEFAULT",
    }),
  );

  it("keeps proof and code priorities above calculation words", () => {
    expect(
      routePrompt("PRUEBA que la suma de dos funciones continuas es continua"),
    ).toEqual({
      intent: "PROVE",
      profile: "MATH",
    });
    expect(routePrompt("Escribe un programa que calcule la media")).toEqual({
      intent: "CODE",
      profile: "DEFAULT",
    });
  });
});
