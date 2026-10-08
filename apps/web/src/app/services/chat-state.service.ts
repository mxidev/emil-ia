import { Injectable, signal } from "@angular/core";
import type {
  Conversation,
  ExportFormat,
  FeedbackRating,
  Message,
} from "../interfaces/conversation.interface";
import { ChatApiService } from "./chat-api.service";
import { ConversationApiService } from "./conversation-api.service";

@Injectable({ providedIn: "root" })
export class ChatStateService {
  readonly messages = signal<Message[]>([]);
  readonly conversations = signal<Conversation[]>([]);
  readonly conversationId = signal<string | undefined>(undefined);
  readonly draft = signal("");
  readonly loading = signal(false);
  readonly feedbackSent = signal(false);
  readonly error = signal<string | null>(null);

  constructor(
    private readonly chatApi: ChatApiService,
    private readonly conversationApi: ConversationApiService,
  ) {}

  async initialize(): Promise<void> {
    await this.loadConversations();
  }

  async loadConversations(): Promise<void> {
    try {
      this.conversations.set(await this.conversationApi.list());
      this.error.set(null);
    } catch (error) {
      this.setError(error);
    }
  }

  startNewConversation(): void {
    this.conversationId.set(undefined);
    this.messages.set([]);
    this.feedbackSent.set(false);
    this.error.set(null);
  }

  async selectConversation(id: string): Promise<void> {
    try {
      this.messages.set(await this.conversationApi.messages(id));
      this.conversationId.set(id);
      this.feedbackSent.set(false);
      this.error.set(null);
    } catch (error) {
      this.setError(error);
    }
  }

  async exportConversation(format: ExportFormat): Promise<void> {
    const id = this.conversationId();
    if (!id) return;
    
    try {
      await this.conversationApi.download(id, format);
    } catch (error) {
      this.setError(error);
    }
  }

  async sendFeedback(rating: FeedbackRating, category?: string): Promise<void> {
    const id = this.conversationId();
    if (!id) return;
    
    try {
      await this.conversationApi.feedback(id, rating, category);
      this.feedbackSent.set(true);
    } catch (error) {
      this.setError(error);
    }
  }

  async send(): Promise<void> {
    const content = this.draft().trim();
    if (!content || this.loading()) return;
    
    this.messages.update((messages) => [
      ...messages,
      { role: "user", content },
      { role: "assistant", content: "" },
    ]);
    this.draft.set("");
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await this.chatApi.stream(
        { content, conversationId: this.conversationId() },
        {
          onToken: (delta) => this.appendAssistantToken(delta),
          onError: (message) => this.error.set(message),
        },
      );
     
      if (result.conversationId) this.conversationId.set(result.conversationId);
      await this.loadConversations();
    } catch (error) {
      this.setError(error);
      this.appendAssistantToken(
        `No se pudo completar la consulta: ${this.error() ?? "error desconocido"}`,
      );
    } finally {
      this.loading.set(false);
    }
  }

  private appendAssistantToken(delta: string): void {
    this.messages.update((messages) =>
      messages.map((message, index) =>
        index === messages.length - 1
          ? { ...message, content: message.content + delta }
          : message,
      ),
    );
  }

  private setError(error: unknown): void {
    this.error.set(
      error instanceof Error ? error.message : "Error desconocido",
    );
  }
}
