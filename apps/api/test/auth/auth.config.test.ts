import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "../../src/auth/auth.config.js";

const sessionSecret = Buffer.alloc(32, 7).toString("base64");

function validEnv(): NodeJS.ProcessEnv {
  return {
    AUTH_ISSUER: "http://localhost:4566/pool-123",
    AUTH_CLIENT_ID: "client-123",
    AUTH_PROVIDER_LOGOUT_URI: "http://localhost:4566/cognito-idp/logout",
    AUTH_REDIRECT_URI: "http://localhost:3000/api/auth/callback",
    AUTH_LOGOUT_URI: "http://localhost:4200/",
    AUTH_SESSION_SECRET: sessionSecret,
    AUTH_ALLOWED_ORIGIN: "http://localhost:4200",
  };
}

describe("loadAuthConfig", () => {
  it("loads the approved local auth defaults", () => {
    const config = loadAuthConfig(validEnv());

    expect(config.issuer).toBe("http://localhost:4566/pool-123");
    expect(config.clientId).toBe("client-123");
    expect(config.providerLogoutUri).toBe(
      "http://localhost:4566/cognito-idp/logout",
    );
    expect(config.oidcScope).toBe("openid");
    expect(config.sessionIdleTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(config.sessionAbsoluteTtlMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(config.loginStateTtlMs).toBe(10 * 60 * 1000);
    expect(config.cookieSecure).toBe(false);
  });

  it("rejects missing required values", () => {
    const env = validEnv();
    delete env.AUTH_SESSION_SECRET;

    expect(() => loadAuthConfig(env)).toThrow(/AUTH_SESSION_SECRET/);
  });

  it("rejects a session secret shorter than 32 bytes", () => {
    const env = validEnv();
    env.AUTH_SESSION_SECRET = Buffer.alloc(16, 1).toString("base64");

    expect(() => loadAuthConfig(env)).toThrow(/32 bytes/);
  });

  it("rejects an insecure cookie in production", () => {
    const env = validEnv();
    env.NODE_ENV = "production";
    env.AUTH_COOKIE_SECURE = "false";
    env.AUTH_ISSUER = "https://login.example/pool-123";
    env.AUTH_REDIRECT_URI = "https://app.example/api/auth/callback";
    env.AUTH_LOGOUT_URI = "https://app.example/";
    env.AUTH_ALLOWED_ORIGIN = "https://app.example";

    expect(() => loadAuthConfig(env)).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it("requires HTTPS for production OIDC and browser URLs", () => {
    const env = validEnv();
    env.NODE_ENV = "production";

    expect(() => loadAuthConfig(env)).toThrow(/AUTH_ISSUER.*https/);
  });

  it("rejects an origin with a path", () => {
    const env = validEnv();
    env.AUTH_ALLOWED_ORIGIN = "http://localhost:4200/student";

    expect(() => loadAuthConfig(env)).toThrow(/only an origin/);
  });

  it("rejects a wildcard origin", () => {
    const env = validEnv();
    env.AUTH_ALLOWED_ORIGIN = "*";

    expect(() => loadAuthConfig(env)).toThrow(/wildcard/);
  });

  it("requires the OIDC scope to include openid", () => {
    const env = validEnv();
    env.AUTH_OIDC_SCOPE = "email";

    expect(() => loadAuthConfig(env)).toThrow(/include openid/);
  });

  it("allows local logout to omit a provider endpoint", () => {
    const env = validEnv();
    delete env.AUTH_PROVIDER_LOGOUT_URI;

    expect(loadAuthConfig(env).providerLogoutUri).toBeUndefined();
  });
});
