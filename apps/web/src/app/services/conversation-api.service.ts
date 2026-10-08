import { Injectable } from "@angular/core";
import { API_BASE_URL } from "../constants/api.constants";
import type {
  Conversation,
  ExportFormat,
  FeedbackRating,
  Message,
} from "../interfaces/conversation.interface";

@Injectable({ providedIn: "root" })
export class ConversationApiService {
  async list(): Promise<Conversation[]> {
    return this.getJson<Conversation[]>(`${API_BASE_URL}/conversations`);
  }

  async messages(conversationId: string): Promise<Message[]> {
    return this.getJson<Message[]>(
      `${API_BASE_URL}/conversations/${conversationId}/messages`,
    );
  }

  async feedback(
    conversationId: string,
    rating: FeedbackRating,
    category?: string,
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/conversations/${conversationId}/feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, category }),
      },
    );
    if (!response.ok) throw new Error("No se pudo guardar el feedback");
  }

  async download(conversationId: string, format: ExportFormat): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/conversations/${conversationId}/export.${format}`,
    );
    
    if (!response.ok) throw new Error("No se pudo exportar la conversación");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    
    link.href = url;
    link.download = `conversation-${conversationId}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`La API respondió ${response.status}`);
    return response.json() as Promise<T>;
  }
}
