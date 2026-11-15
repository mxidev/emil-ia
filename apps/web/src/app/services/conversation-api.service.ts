import { Injectable } from "@angular/core";
import { API_BASE_URL } from "../constants/api.constants";
import { readApiError } from "./api-error";
import { ApiClientService } from "./api-client.service";
import type {
  Conversation,
  ExportFormat,
  FeedbackRating,
  Message,
  Attachment,
} from "../interfaces/conversation.interface";

@Injectable({ providedIn: "root" })
export class ConversationApiService {
  constructor(private readonly client = new ApiClientService()) {}

  async list(): Promise<Conversation[]> {
    return this.getJson<Conversation[]>(`${API_BASE_URL}/conversations`);
  }

  async messages(conversationId: string): Promise<Message[]> {
    return this.getJson<Message[]>(
      `${API_BASE_URL}/conversations/${conversationId}/messages`,
    );
  }

  async attachments(conversationId: string): Promise<Attachment[]> {
    return this.getJson<Attachment[]>(
      `${API_BASE_URL}/conversations/${conversationId}/attachments`,
    );
  }

  async uploadAttachment(
    conversationId: string,
    file: File,
  ): Promise<Attachment> {
    const form = new FormData();
    form.append("file", file);
    const response = await this.client.request(
      `${API_BASE_URL}/conversations/${conversationId}/attachments`,
      { method: "POST", body: form },
    );
    if (!response.ok) throw new Error(await readApiError(response));
    return response.json() as Promise<Attachment>;
  }

  async deleteAttachment(
    conversationId: string,
    attachmentId: string,
  ): Promise<void> {
    const response = await this.client.request(
      `${API_BASE_URL}/conversations/${conversationId}/attachments/${attachmentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error(await readApiError(response));
  }

  async feedback(
    conversationId: string,
    rating: FeedbackRating,
    category?: string,
  ): Promise<void> {
    const response = await this.client.request(
      `${API_BASE_URL}/conversations/${conversationId}/feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, category }),
      },
    );
    if (!response.ok) throw new Error(await readApiError(response));
  }

  async download(conversationId: string, format: ExportFormat): Promise<void> {
    const response = await this.client.request(
      `${API_BASE_URL}/conversations/${conversationId}/export.${format}`,
    );
    
    if (!response.ok) throw new Error(await readApiError(response));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    
    link.href = url;
    link.download = `conversation-${conversationId}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await this.client.request(url);
    
    if (!response.ok) throw new Error(await readApiError(response));
    return response.json() as Promise<T>;
  }
}
