import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../repositories/conversation.repository.js";

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  repository: ConversationRepository,
): void {
  app.get("/api/analytics/summary", () => repository.getAnalyticsSummary());
}
