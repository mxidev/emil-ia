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

function parsedUrl(env: NodeJS.ProcessEnv, name: string): URL {
  const value = required(env, name);
  if (value === "*") throw new Error(`${name} cannot be a wildcard`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function validateProductionUrls(
  nodeEnvironment: string,
  issuer: URL,
  redirectUri: URL,
  logoutUri: URL,
  allowedOrigin: URL,
  cookieSecure: boolean,
): void {
  if (allowedOrigin.pathname !== "/" || allowedOrigin.search || allowedOrigin.hash) {
    throw new Error("AUTH_ALLOWED_ORIGIN must contain only an origin");
  }
  if (nodeEnvironment !== "production") return;
  if (!cookieSecure) throw new Error("AUTH_COOKIE_SECURE must be true in production");
  for (const [name, value] of [
    ["AUTH_ISSUER", issuer],
    ["AUTH_REDIRECT_URI", redirectUri],
    ["AUTH_LOGOUT_URI", logoutUri],
    ["AUTH_ALLOWED_ORIGIN", allowedOrigin],
  ] as const) {
    if (value.protocol !== "https:") {
      throw new Error(`${name} must use https in production`);
    }
  }
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
  const issuerUrl = parsedUrl(env, "AUTH_ISSUER");
  const redirectUri = parsedUrl(env, "AUTH_REDIRECT_URI");
  const logoutUri = parsedUrl(env, "AUTH_LOGOUT_URI");
  const allowedOrigin = parsedUrl(env, "AUTH_ALLOWED_ORIGIN");
  const cookieSecure = booleanValue(env, "AUTH_COOKIE_SECURE", nodeEnvironment === "production");
  validateProductionUrls(
    nodeEnvironment,
    issuerUrl,
    redirectUri,
    logoutUri,
    allowedOrigin,
    cookieSecure,
  );

  return {
    issuer: issuerUrl.toString().replace(/\/$/, ""),
    clientId: required(env, "AUTH_CLIENT_ID"),
    redirectUri: redirectUri.toString(),
    logoutUri: logoutUri.toString(),
    allowedOrigin: allowedOrigin.origin,
    sessionSecret,
    cookieName: env.AUTH_COOKIE_NAME?.trim() || "emilia_session",
    cookieSecure,
    sessionIdleTtlMs: idleDays * DAY_MS,
    sessionAbsoluteTtlMs: absoluteDays * DAY_MS,
    loginStateTtlMs: stateSeconds * 1000,
  };
}
