import type { SandboxStatus } from "./math-verification.interface.js";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelExecutionRecord {
  id: string;
  conversationId: string;
  profile: string;
  intent: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: { sandbox: { status: SandboxStatus } };
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsSummary {
  conversations: number;
  messages: number;
  executions: number;
  averageLatencyMs: number | null;
  feedback: Record<string, number>;
}
