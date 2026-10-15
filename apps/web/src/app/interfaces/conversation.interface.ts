export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: "ready" | "failed";
  extractionError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FeedbackRating = "positive" | "negative";
export type ExportFormat = "md" | "pdf";
