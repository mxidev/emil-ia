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

async function appWithProtectedRoute() {
  const auth = {
    getSession: vi.fn(async (cookie: string) => (cookie === "session-token" ? user : null)),
    logout: vi.fn(),
  };
  const app = Fastify();
  registerAuthPlugin(app, { config, service: auth });
  app.get("/protected", { preHandler: app.authenticate }, async (request) => ({
    userId: request.authUser!.id,
  }));
  await app.ready();
  return { app, auth };
}

describe("auth plugin", () => {
  it("rejects requests without a valid opaque session", async () => {
    const { app } = await appWithProtectedRoute();

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("does not reach a protected handler with a bearer token", async () => {
    const { app, auth } = await appWithProtectedRoute();

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer malformed-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(auth.getSession).not.toHaveBeenCalled();
    await app.close();
  });

  it("exposes only the internally resolved user to protected routes", async () => {
    const { app } = await appWithProtectedRoute();

    const response = await app.inject({
      method: "GET",
      url: "/protected?userId=other-user",
      headers: { cookie: "emilia_session=session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: "user-123" });
    await app.close();
  });
});
