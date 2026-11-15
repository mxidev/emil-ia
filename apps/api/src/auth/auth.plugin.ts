import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "./auth.service.js";
import type { AuthConfig } from "./auth.types.js";

export const CSRF_COOKIE_NAME = "emilia_csrf";
export const AUTH_STATE_COOKIE_NAME = "emilia_auth_state";

type AuthServicePort = Pick<AuthService, "getSession">;

export interface AuthPluginOptions {
  config: AuthConfig;
  service: AuthServicePort;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [];
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!name) return [];
      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export function getRequestCookie(request: FastifyRequest, name: string): string | undefined {
  return parseCookies(request.headers.cookie)[name];
}

export function appendCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  options: {
    path: string;
    maxAgeSeconds?: number;
    httpOnly?: boolean;
    secure: boolean;
  },
): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    "SameSite=Lax",
  ];
  if (options.maxAgeSeconds !== undefined) attributes.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.secure) attributes.push("Secure");
  const existing = reply.raw.getHeader("set-cookie");
  const cookies = Array.isArray(existing)
    ? existing.map(String)
    : existing
      ? [String(existing)]
      : [];
  cookies.push(attributes.join("; "));
  reply.header("set-cookie", cookies);
}

export function clearCookie(reply: FastifyReply, name: string, path: string, secure: boolean): void {
  appendCookie(reply, name, "", {
    path,
    maxAgeSeconds: 0,
    httpOnly: name !== CSRF_COOKIE_NAME,
    secure,
  });
}

function equalSecrets(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function registerAuthPlugin(
  app: FastifyInstance,
  options: AuthPluginOptions,
): void {
  app.decorateRequest("authUser", null);
  app.decorate("authenticate", async (request, reply) => {
    const sessionCookie = getRequestCookie(request, options.config.cookieName);
    const user = sessionCookie ? await options.service.getSession(sessionCookie) : null;
    if (!user) {
      await reply.code(401).send({ error: "Authentication required" });
      return;
    }
    request.authUser = user;
  });

  app.decorate("requireCsrf", async (request, reply) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
    if (request.headers.origin !== options.config.allowedOrigin) {
      await reply.code(403).send({ error: "Invalid request origin" });
      return;
    }
    const cookies = parseCookies(request.headers.cookie);
    if (!equalSecrets(cookies[CSRF_COOKIE_NAME], request.headers["x-csrf-token"] as string | undefined)) {
      await reply.code(403).send({ error: "Invalid CSRF token" });
    }
  });
}
