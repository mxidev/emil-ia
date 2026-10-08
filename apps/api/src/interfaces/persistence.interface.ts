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
