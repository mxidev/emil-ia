import type { AuthenticatedUser } from "./auth.types.js";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthenticatedUser | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};
