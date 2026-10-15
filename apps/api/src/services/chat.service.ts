import type { AIEvent, AIRequest, Intent, Profile } from "@emil-ia/contracts";
import type { SandboxStatus } from "../interfaces/math-verification.interface.js";
import type { AIProvider } from "../provider.js";
import { routePrompt } from "../router.js";
import type { ConversationRepository } from "../repositories/conversation.repository.js";
import type { MathVerificationService } from "./math-verification.service.js";
import type { AttachmentService } from "./attachment.service.js";

type ChatRepository = Pick<
  ConversationRepository,
  "createConversation" | "getMessages" | "addMessage" | "recordExecution"
>;
type MathVerifier = Pick<MathVerificationService, "verify">;
type AttachmentContext = Pick<AttachmentService, "getContext">;

export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly provider: AIProvider,
    private readonly mathVerification: MathVerifier,
    private readonly attachmentService?: AttachmentContext,
  ) {}

  async prepare(
    content: string,
    requestedConversationId?: string,
    attachmentIds: string[] = [],
  ) {
    const conversationId = requestedConversationId ?? crypto.randomUUID();
    if (!requestedConversationId) {
      await this.repository.createConversation(conversationId, content);
    }

    const messages = await this.repository.getMessages(conversationId);
    await this.repository.addMessage(conversationId, { role: "user", content });
    messages.push({ role: "user", content });
    const attachmentMessages =
      attachmentIds.length > 0
        ? await this.attachmentService?.getContext(conversationId, attachmentIds)
        : [];
    if (attachmentIds.length > 0 && !attachmentMessages) {
      throw new Error("Attachment context is not configured");
    }
    const contextualMessages = [
      ...(attachmentMessages ?? []),
      ...messages,
    ];
    const route = routePrompt(content);
    const verification = await this.mathVerification.verify(contextualMessages, {
      ...route,
      sessionId: conversationId,
    });
    const providerMessages: AIRequest["messages"] = verification.systemMessage
      ? [
          { role: "system", content: verification.systemMessage },
          ...contextualMessages,
        ]
      : contextualMessages;

    return {
      conversationId,
      ...route,
      sandboxStatus: verification.status,
      events: this.withFooter(
        this.provider.stream({
          messages: providerMessages,
          ...route,
          sessionId: conversationId,
        }),
        verification.footer,
      ),
    };
  }

  async complete(data: {
    executionId: string;
    conversationId: string;
    content: string;
    profile: Profile;
    intent: Intent;
    latencyMs: number;
    sandboxStatus: SandboxStatus;
    inputTokens?: number;
    outputTokens?: number;
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
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      metadata: { sandbox: { status: data.sandboxStatus } },
    });
  }

  private async *withFooter(
    events: AsyncIterable<AIEvent>,
    footer?: string,
  ): AsyncIterable<AIEvent> {
    for await (const event of events) {
      if (event.type === "done" && footer) {
        yield { type: "text", delta: footer };
      }
      yield event;
    }
  }
}
