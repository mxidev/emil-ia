import type { AIProvider } from "../provider.js";
import { routePrompt } from "../router.js";
import type { ConversationRepository } from "../repositories/conversation.repository.js";

export class ChatService {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly provider: AIProvider,
  ) {}

  async prepare(content: string, requestedConversationId?: string) {
    const conversationId = requestedConversationId ?? crypto.randomUUID();
    if (!requestedConversationId) {
      await this.repository.createConversation(conversationId, content);
    }

    const messages = await this.repository.getMessages(conversationId);
    await this.repository.addMessage(conversationId, { role: "user", content });
    messages.push({ role: "user", content });
    const route = routePrompt(content);

    return {
      conversationId,
      messages,
      ...route,
      events: this.provider.stream({ messages, ...route }),
    };
  }

  async complete(data: {
    executionId: string;
    conversationId: string;
    content: string;
    profile: string;
    intent: string;
    latencyMs: number;
  }): Promise<void> {
    await this.repository.addMessage(data.conversationId, {
      role: "assistant",
      content: data.content,
    });
    await this.repository.recordExecution({
      id: data.executionId,
      conversationId: data.conversationId,
      profile: data.profile,
      intent: data.intent,
      latencyMs: data.latencyMs,
    });
  }
}
