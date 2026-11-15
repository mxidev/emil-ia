import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "../../src/routes/auth.routes.js";
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
  sessionIdleTtlMs: 7 * 24 * 60 * 60 * 1000,
  sessionAbsoluteTtlMs: 30 * 24 * 60 * 60 * 1000,
  loginStateTtlMs: 10 * 60 * 1000,
};

const user: AuthenticatedUser = {
  id: "user-123",
  displayName: "Ada Lovelace",
  issuer: config.issuer,
  subject: "subject-123",
};

function service() {
  return {
    beginLogin: vi.fn(async () => ({
      redirectUrl: "https://login.example/authorize?state=state-token",
      stateCookie: "state-token",
    })),
    completeLogin: vi.fn(async () => ({ sessionCookie: "session-token", user })),
    getSession: vi.fn(async () => user),
    logout: vi.fn(async () => undefined),
  };
}

describe("auth routes", () => {
  it("redirects login and stores the short-lived state cookie", async () => {
    const auth = service();
    const app = Fastify();
    registerAuthPlugin(app, { config, service: auth });
    registerAuthRoutes(app, { config, service: auth });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/api/auth/login" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      "https://login.example/authorize?state=state-token",
    );
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("emilia_auth_state=state-token")]),
    );
    await app.close();
  });

  it("exchanges a callback only when the state cookie matches", async () => {
    const auth = service();
    const app = Fastify();
    registerAuthPlugin(app, { config, service: auth });
    registerAuthRoutes(app, { config, service: auth });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/callback?state=state-token&code=authorization-code",
      headers: { cookie: "emilia_auth_state=state-token" },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(config.logoutUri);
    expect(auth.completeLogin).toHaveBeenCalledWith("state-token", "authorization-code");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("emilia_session=session-token")]),
    );
    await app.close();
  });

  it("returns 400 when callback state is missing or does not match", async () => {
    const auth = service();
    const app = Fastify();
    registerAuthPlugin(app, { config, service: auth });
    registerAuthRoutes(app, { config, service: auth });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/callback?state=wrong&code=authorization-code",
      headers: { cookie: "emilia_auth_state=state-token" },
    });

    expect(response.statusCode).toBe(400);
    expect(auth.completeLogin).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns the authenticated session and sets a CSRF cookie", async () => {
    const auth = service();
    const app = Fastify();
    registerAuthPlugin(app, { config, service: auth });
    registerAuthRoutes(app, { config, service: auth });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: "emilia_session=session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("emilia_csrf=")]),
    );
    await app.close();
  });
});
