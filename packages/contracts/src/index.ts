import { z } from "zod";

export const ProfileSchema = z.enum(["FAST", "DEFAULT", "MATH"]);
export type Profile = z.infer<typeof ProfileSchema>;
export const IntentSchema = z.enum([
  "EXPLAIN",
  "SOLVE",
  "PROVE",
  "VERIFY",
  "COMPUTE",
  "SUMMARIZE",
  "CODE",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const ChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string().uuid()).max(5).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const AttachmentStatusSchema = z.enum(["ready", "failed"]);
export type AttachmentStatus = z.infer<typeof AttachmentStatusSchema>;

export interface AttachmentMetadata {
  id: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: AttachmentStatus;
  extractionError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIRequest {
  sessionId?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  profile: Profile;
  intent: Intent;
}
export type AIEvent =
  | { type: "text"; delta: string }
  | {
      type: "done";
      executionId: string;
      profile: Profile;
      intent: Intent;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { type: "error"; message: string };
export interface Artifact {
  type: "markdown" | "latex" | "file";
  name: string;
  content?: string;
  url?: string;
}
