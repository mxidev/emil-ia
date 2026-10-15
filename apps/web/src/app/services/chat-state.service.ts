import { Injectable, signal } from "@angular/core";
import type {
  Conversation,
  ExportFormat,
  FeedbackRating,
  Message,
  Attachment,
} from "../interfaces/conversation.interface";
import { ChatApiService } from "./chat-api.service";
import { ConversationApiService } from "./conversation-api.service";
import { NotificationService } from "./notification.service";

@Injectable({ providedIn: "root" })
export class ChatStateService {
  readonly messages = signal<Message[]>([]);
  readonly conversations = signal<Conversation[]>([]);
  readonly conversationId = signal<string | undefined>(undefined);
  readonly draft = signal("");
  readonly loading = signal(false);
  readonly feedbackSent = signal(false);
  readonly error = signal<string | null>(null);
  readonly attachments = signal<Attachment[]>([]);
  readonly selectedAttachmentIds = signal<string[]>([]);

  constructor(
    private readonly chatApi: ChatApiService,
    private readonly conversationApi: ConversationApiService,
    private readonly notifications: NotificationService,
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
    this.attachments.set([]);
    this.selectedAttachmentIds.set([]);
    this.feedbackSent.set(false);
    this.error.set(null);
  }

  async selectConversation(id: string): Promise<void> {
    try {
      const [messages, attachments] = await Promise.all([
        this.conversationApi.messages(id),
        this.conversationApi.attachments(id),
      ]);
      this.messages.set(messages);
      this.attachments.set(attachments);
      this.selectedAttachmentIds.set(
        attachments
          .filter((attachment) => attachment.status === "ready")
          .slice(0, 5)
          .map((attachment) => attachment.id),
      );
      this.conversationId.set(id);
      this.feedbackSent.set(false);
      this.error.set(null);
    } catch (error) {
      this.setError(error);
    }
  }

  async uploadAttachment(file: File): Promise<void> {
    const id = this.conversationId();
    if (!id) {
      this.setError(new Error("Crea o selecciona una conversación primero"));
      return;
    }

    try {
      const attachment = await this.conversationApi.uploadAttachment(id, file);
      this.attachments.update((attachments) => [...attachments, attachment]);
      if (
        attachment.status === "ready" &&
        this.selectedAttachmentIds().length < 5
      ) {
        this.selectedAttachmentIds.update((ids) => [...ids, attachment.id]);
      }
    } catch (error) {
      this.setError(error);
    }
  }

  removeAttachmentSelection(id: string): void {
    this.selectedAttachmentIds.update((ids) => ids.filter((value) => value !== id));
  }

  toggleAttachmentSelection(id: string): void {
    const attachment = this.attachments().find((item) => item.id === id);
    if (!attachment || attachment.status !== "ready") return;
    if (this.selectedAttachmentIds().includes(id)) {
      this.removeAttachmentSelection(id);
      return;
    }
    if (this.selectedAttachmentIds().length >= 5) {
      this.setError(new Error("Puedes seleccionar hasta 5 PDFs por consulta"));
      return;
    }
    this.selectedAttachmentIds.update((ids) => [...ids, id]);
  }

  async exportConversation(format: ExportFormat): Promise<void> {
    const id = this.conversationId();
    if (!id) return;
    
    try {
      await this.conversationApi.download(id, format);
      this.notifications.show(
        "success",
        `Conversación exportada en ${format === "pdf" ? "PDF" : "Markdown"}.`,
      );
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
      this.notifications.show("success", "Gracias por tu feedback.");
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
    let streamErrorReported = false;

    try {
      const result = await this.chatApi.stream(
        {
          content,
          conversationId: this.conversationId(),
          ...(this.selectedAttachmentIds().length > 0
            ? { attachmentIds: this.selectedAttachmentIds() }
            : {}),
        },
        {
          onToken: (delta) => this.appendAssistantToken(delta),
          onError: (message) => {
            if (streamErrorReported) return;
            streamErrorReported = true;
            this.setError(new Error(message));
            this.appendAssistantToken(`No se pudo completar la consulta: ${message}`);
          },
        },
      );
     
      if (result.conversationId) this.conversationId.set(result.conversationId);
      await this.loadConversations();
    } catch (error) {
      if (!streamErrorReported) {
        this.setError(error);
        this.appendAssistantToken(
          `No se pudo completar la consulta: ${this.error() ?? "error desconocido"}`,
        );
      }
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
    const message = error instanceof Error ? error.message : "Error desconocido";
    this.error.set(message);
    this.notifications.show("error", message);
  }
}
