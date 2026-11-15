import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomToken } from "../auth/auth.crypto.js";
import {
  appendCookie,
  AUTH_STATE_COOKIE_NAME,
  clearCookie,
  CSRF_COOKIE_NAME,
  getRequestCookie,
} from "../auth/auth.plugin.js";
import type { AuthService } from "../auth/auth.service.js";
import type { AuthConfig } from "../auth/auth.types.js";

type AuthRouteService = Pick<
  AuthService,
  "beginLogin" | "completeLogin" | "getSession" | "logout"
>;

export interface AuthRouteOptions {
  config: AuthConfig;
  service: AuthRouteService;
}

function ensureCsrfCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AuthConfig,
): void {
  if (getRequestCookie(request, CSRF_COOKIE_NAME)) return;
  appendCookie(reply, CSRF_COOKIE_NAME, randomToken(32), {
    path: "/",
    httpOnly: false,
    secure: config.cookieSecure,
  });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): void {
  app.get("/api/auth/login", async (_request, reply) => {
    const login = await options.service.beginLogin();
    appendCookie(reply, AUTH_STATE_COOKIE_NAME, login.stateCookie, {
      path: "/api/auth/callback",
      maxAgeSeconds: Math.floor(options.config.loginStateTtlMs / 1000),
      httpOnly: true,
      secure: options.config.cookieSecure,
    });
    appendCookie(reply, CSRF_COOKIE_NAME, randomToken(32), {
      path: "/",
      httpOnly: false,
      secure: options.config.cookieSecure,
    });
    return reply.code(302).header("location", login.redirectUrl).send();
  });

  app.get("/api/auth/callback", async (request, reply) => {
    const query = request.query as { state?: string; code?: string; error?: string };
    const stateCookie = getRequestCookie(request, AUTH_STATE_COOKIE_NAME);
    if (!query.state || !query.code || query.error || stateCookie !== query.state) {
      return reply.code(400).send({ error: "Invalid authentication callback" });
    }

    try {
      const result = await options.service.completeLogin(query.state, query.code);
      appendCookie(reply, options.config.cookieName, result.sessionCookie, {
        path: "/",
        maxAgeSeconds: Math.floor(options.config.sessionAbsoluteTtlMs / 1000),
        httpOnly: true,
        secure: options.config.cookieSecure,
      });
      clearCookie(reply, AUTH_STATE_COOKIE_NAME, "/api/auth/callback", options.config.cookieSecure);
      ensureCsrfCookie(request, reply, options.config);
      return reply.code(302).header("location", options.config.logoutUri).send();
    } catch {
      return reply.code(400).send({ error: "Authentication callback failed" });
    }
  });

  app.get("/api/auth/session", async (request, reply) => {
    ensureCsrfCookie(request, reply, options.config);
    const sessionCookie = getRequestCookie(request, options.config.cookieName);
    const user = sessionCookie ? await options.service.getSession(sessionCookie) : null;
    if (!user) {
      if (sessionCookie) clearCookie(reply, options.config.cookieName, "/", options.config.cookieSecure);
      return reply.code(401).send({ error: "Unauthenticated" });
    }
    return { user };
  });

  app.post(
    "/api/auth/logout",
    { preHandler: app.requireCsrf },
    async (request, reply) => {
      const sessionCookie = getRequestCookie(request, options.config.cookieName);
      if (sessionCookie) await options.service.logout(sessionCookie);
      clearCookie(reply, options.config.cookieName, "/", options.config.cookieSecure);
      return reply.code(204).send();
    },
  );
}
