import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAuthPlugin } from "../../src/auth/auth.plugin.js";
import type { AuthConfig, AuthenticatedUser } from "../../src/auth/auth.types.js";

const config: AuthConfig = {
  issuer: "http://localhost:4566/pool-123",
  clientId: "client-123",
  redirectUri: "http://localhost:3000/api/auth/callback",
  logoutUri: "http://localhost:4200/",
  allowedOrigin: "http://localhost:4200",
  sessionSecret: Buffer.alloc(32, 8),
  cookieName: "emilia_session",
  cookieSecure: false,
  sessionIdleTtlMs: 100,
  sessionAbsoluteTtlMs: 1000,
  loginStateTtlMs: 100,
};
const user: AuthenticatedUser = {
  id: "user-123",
  displayName: "Ada Lovelace",
  issuer: config.issuer,
  subject: "subject-123",
};

async function appWithMutation() {
  const app = Fastify();
  registerAuthPlugin(app, {
    config,
    service: { getSession: vi.fn(async () => user) },
  });
  app.post(
    "/mutation",
    { preHandler: [app.authenticate, app.requireCsrf] },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
}

describe("CSRF protection", () => {
  it.each([
    ["missing csrf header", "emilia_session=session-token; emilia_csrf=csrf-token", undefined, config.allowedOrigin],
    ["mismatched csrf", "emilia_session=session-token; emilia_csrf=csrf-token", "other-token", config.allowedOrigin],
    ["unallowed origin", "emilia_session=session-token; emilia_csrf=csrf-token", "csrf-token", "http://evil.example"],
  ])("rejects %s", async (_name, cookie, csrfHeader, origin) => {
    const app = await appWithMutation();
    const headers: Record<string, string> = { cookie, origin };
    if (csrfHeader) headers["x-csrf-token"] = csrfHeader;

    const response = await app.inject({ method: "POST", url: "/mutation", headers });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("accepts a mutation with matching CSRF values and origin", async () => {
    const app = await appWithMutation();

    const response = await app.inject({
      method: "POST",
      url: "/mutation",
      headers: {
        cookie: "emilia_session=session-token; emilia_csrf=csrf-token",
        "x-csrf-token": "csrf-token",
        origin: config.allowedOrigin,
      },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
