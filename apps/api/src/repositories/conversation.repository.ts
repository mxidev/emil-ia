import type { Pool } from "pg";
import { DATABASE_QUERIES } from "../database/queries.js";
import { INITIAL_SCHEMA_SQL } from "../database/schema.js";
import type {
  AnalyticsSummary,
  ConversationSummary,
  ModelExecutionRecord,
  NewAttachment,
  StoredAttachment,
  StoredMessage,
} from "../interfaces/persistence.interface.js";
import type { AttachmentMetadata } from "@emil-ia/contracts";

type AttachmentRow = Omit<AttachmentMetadata, "createdAt" | "updatedAt"> & {
  content?: Buffer;
  extractedText?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function mapAttachmentMetadata(row: AttachmentRow): AttachmentMetadata {
  return {
    id: row.id,
    conversationId: row.conversationId,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    status: row.status,
    extractionError: row.extractionError ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  };
}

export class ConversationRepository {
  private readonly localUserId = "00000000-0000-4000-8000-000000000001";

  constructor(private readonly pool: Pool) {}

  async initialize(): Promise<void> {
    await this.pool.query(INITIAL_SCHEMA_SQL);
    await this.pool.query(DATABASE_QUERIES.createLocalUser, [
      this.localUserId,
      "Usuario local",
    ]);
  }

  async createConversation(id: string, title: string): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.createConversation, [
      id,
      this.localUserId,
      title.slice(0, 120),
    ]);
  }

  async addMessage(
    conversationId: string,
    message: StoredMessage,
  ): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.addMessage, [
      crypto.randomUUID(),
      conversationId,
      message.role,
      message.content,
    ]);
    await this.pool.query(DATABASE_QUERIES.touchConversation, [conversationId]);
  }

  async getMessages(conversationId: string): Promise<StoredMessage[]> {
    const result = await this.pool.query<StoredMessage>(
      DATABASE_QUERIES.getMessages,
      [conversationId],
    );
    return result.rows;
  }

  async recordExecution(data: ModelExecutionRecord): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.recordExecution, [
      data.id,
      data.conversationId,
      process.env.OPENCODE_API_KEY ? "opencode" : "mock",
      process.env.OPENCODE_MODEL || null,
      data.profile,
      data.intent,
      data.latencyMs,
      data.inputTokens ?? null,
      data.outputTokens ?? null,
      data.metadata ?? null,
    ]);
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const result = await this.pool.query<ConversationSummary>(
      DATABASE_QUERIES.listConversations,
      [this.localUserId],
    );
    return result.rows;
  }

  async findConversationTitle(conversationId: string): Promise<string | null> {
    const result = await this.pool.query<{ title: string }>(
      DATABASE_QUERIES.findConversationTitle,
      [conversationId, this.localUserId],
    );
    return result.rows[0]?.title ?? null;
  }

  async addFeedback(
    conversationId: string,
    rating: "positive" | "negative",
    category?: string,
  ): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.addFeedback, [
      crypto.randomUUID(),
      conversationId,
      rating,
      category ?? null,
    ]);
  }

  async createAttachment(data: NewAttachment): Promise<AttachmentMetadata> {
    const result = await this.pool.query<AttachmentRow>(
      DATABASE_QUERIES.createAttachment,
      [
        data.id,
        data.conversationId,
        data.filename,
        data.mimeType,
        data.byteSize,
        data.content,
        data.extractedText,
        data.status,
        data.extractionError ?? null,
      ],
    );
    return mapAttachmentMetadata(result.rows[0]);
  }

  async listAttachments(conversationId: string): Promise<AttachmentMetadata[]> {
    const result = await this.pool.query<AttachmentRow>(
      DATABASE_QUERIES.listAttachments,
      [conversationId],
    );
    return result.rows.map(mapAttachmentMetadata);
  }

  async deleteAttachment(
    conversationId: string,
    attachmentId: string,
  ): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      DATABASE_QUERIES.deleteAttachment,
      [conversationId, attachmentId],
    );
    return result.rowCount === 1;
  }

  async getAttachmentsForChat(
    conversationId: string,
    ids: string[],
  ): Promise<StoredAttachment[]> {
    const result = await this.pool.query<AttachmentRow>(
      DATABASE_QUERIES.getAttachmentsForChat,
      [conversationId, ids],
    );
    return result.rows.map((row) => ({
      ...mapAttachmentMetadata(row),
      content: row.content as Buffer,
      extractedText: row.extractedText ?? "",
    }));
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const parameters = [this.localUserId];
    const [conversations, messages, executions, latency, feedback] =
      await Promise.all([
        this.pool.query<{ count: string }>(
          DATABASE_QUERIES.countConversations,
          parameters,
        ),
        this.pool.query<{ count: string }>(
          DATABASE_QUERIES.countMessages,
          parameters,
        ),
        this.pool.query<{ count: string }>(
          DATABASE_QUERIES.countExecutions,
          parameters,
        ),
        this.pool.query<{ average: string | null }>(
          DATABASE_QUERIES.averageLatency,
          parameters,
        ),
        this.pool.query<{ rating: string; count: string }>(
          DATABASE_QUERIES.feedbackCounts,
          parameters,
        ),
      ]);

    return {
      conversations: Number(conversations.rows[0].count),
      messages: Number(messages.rows[0].count),
      executions: Number(executions.rows[0].count),
      averageLatencyMs: latency.rows[0].average
        ? Number(latency.rows[0].average)
        : null,
      feedback: Object.fromEntries(
        feedback.rows.map((row) => [row.rating, Number(row.count)]),
      ),
    };
  }
}
