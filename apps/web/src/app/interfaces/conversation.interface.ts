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

export type FeedbackRating = "positive" | "negative";
export type ExportFormat = "md" | "pdf";
