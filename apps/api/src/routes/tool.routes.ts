import type { FastifyInstance } from "fastify";
import type { SandboxClient } from "../sandbox.js";
import { SandboxRequestSchema } from "../sandbox.js";

export function registerToolRoutes(
  app: FastifyInstance,
  sandbox: SandboxClient,
): void {
  app.post("/api/tools/python", async (request, reply) => {
    const parsed = SandboxRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(JSON.stringify(parsed.error.flatten()));
    }
    
    try {
      return await sandbox.run(parsed.data);
    } catch (error) {
      return reply.badGateway(
        JSON.stringify({
          message:
            error instanceof Error ? error.message : "Sandbox no disponible",
        }),
      );
    }
  });
}
