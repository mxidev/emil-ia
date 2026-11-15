import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "../../scripts/floci/setup-auth.ps1"),
  "utf8",
);

describe("local Floci auth setup", () => {
  it("pins the approved local topology and PKCE flow", () => {
    expect(script).toContain("http://localhost:4566");
    expect(script).toContain("http://localhost:3000/api/auth/callback");
    expect(script).toContain("http://localhost:4200/");
    expect(script).toContain("--allowed-o-auth-flows");
    expect(script).toContain("code");
    expect(script).toContain("--no-generate-secret");
  });

  it("does not print the generated session secret", () => {
    expect(script).toMatch(/AUTH_SESSION_SECRET/);
    expect(script).toMatch(/not printed|no se imprime|written to \.env/i);
  });
});
