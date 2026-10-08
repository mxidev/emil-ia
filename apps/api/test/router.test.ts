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
});
