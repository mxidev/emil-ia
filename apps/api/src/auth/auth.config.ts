import type { AuthConfig } from "./auth.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function booleanValue(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const value = env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const sessionSecret = Buffer.from(required(env, "AUTH_SESSION_SECRET"), "base64");
  if (sessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must decode to at least 32 bytes");
  }

  const nodeEnvironment = env.NODE_ENV ?? "development";
  const idleDays = positiveInteger(env, "AUTH_SESSION_IDLE_DAYS", 7);
  const absoluteDays = positiveInteger(env, "AUTH_SESSION_ABSOLUTE_DAYS", 30);
  const stateSeconds = positiveInteger(
    env,
    "AUTH_LOGIN_STATE_TTL_SECONDS",
    10 * 60,
  );

  return {
    issuer: required(env, "AUTH_ISSUER").replace(/\/$/, ""),
    clientId: required(env, "AUTH_CLIENT_ID"),
    redirectUri: required(env, "AUTH_REDIRECT_URI"),
    logoutUri: required(env, "AUTH_LOGOUT_URI"),
    allowedOrigin: required(env, "AUTH_ALLOWED_ORIGIN"),
    sessionSecret,
    cookieName: env.AUTH_COOKIE_NAME?.trim() || "emilia_session",
    cookieSecure: booleanValue(env, "AUTH_COOKIE_SECURE", nodeEnvironment === "production"),
    sessionIdleTtlMs: idleDays * DAY_MS,
    sessionAbsoluteTtlMs: absoluteDays * DAY_MS,
    loginStateTtlMs: stateSeconds * 1000,
  };
}
