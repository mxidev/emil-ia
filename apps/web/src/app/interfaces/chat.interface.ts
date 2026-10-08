import type { Message } from "./conversation.interface";

export interface ChatRequest {
  content: string;
  conversationId?: string;
}

export interface ChatStreamHandlers {
  onToken(delta: string): void;
  onError(message: string): void;
}

export interface ChatResult {
  conversationId?: string;
}

export interface ConversationMessagesResponse extends Array<Message> {}
