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
  constructor(private readonly pool: Pool) {}

  async initialize(): Promise<void> {
    await this.pool.query(INITIAL_SCHEMA_SQL);
  }

  async createConversation(userId: string, id: string, title: string): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.createConversation, [
      id,
      userId,
      title.slice(0, 120),
    ]);
  }

  async addMessage(
    userId: string,
    conversationId: string,
    message: StoredMessage,
  ): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.addMessage, [
      crypto.randomUUID(),
      conversationId,
      message.role,
      message.content,
      userId,
    ]);
    await this.pool.query(DATABASE_QUERIES.touchConversation, [conversationId, userId]);
  }

  async getMessages(userId: string, conversationId: string): Promise<StoredMessage[]> {
    const result = await this.pool.query<StoredMessage>(
      DATABASE_QUERIES.getMessages,
      [conversationId, userId],
    );
    return result.rows;
  }

  async recordExecution(userId: string, data: ModelExecutionRecord): Promise<void> {
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
      userId,
    ]);
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const result = await this.pool.query<ConversationSummary>(
      DATABASE_QUERIES.listConversations,
      [userId],
    );
    return result.rows;
  }

  async findConversationTitle(userId: string, conversationId: string): Promise<string | null> {
    const result = await this.pool.query<{ title: string }>(
      DATABASE_QUERIES.findConversationTitle,
      [conversationId, userId],
    );
    return result.rows[0]?.title ?? null;
  }

  async addFeedback(
    userId: string,
    conversationId: string,
    rating: "positive" | "negative",
    category?: string,
  ): Promise<void> {
    await this.pool.query(DATABASE_QUERIES.addFeedback, [
      crypto.randomUUID(),
      conversationId,
      rating,
      category ?? null,
      userId,
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
        data.userId,
      ],
    );
    return mapAttachmentMetadata(result.rows[0]);
  }

  async listAttachments(userId: string, conversationId: string): Promise<AttachmentMetadata[]> {
    const result = await this.pool.query<AttachmentRow>(
      DATABASE_QUERIES.listAttachments,
      [conversationId, userId],
    );
    return result.rows.map(mapAttachmentMetadata);
  }

  async deleteAttachment(
    userId: string,
    conversationId: string,
    attachmentId: string,
  ): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      DATABASE_QUERIES.deleteAttachment,
      [conversationId, attachmentId, userId],
    );
    return result.rowCount === 1;
  }

  async getAttachmentsForChat(
    userId: string,
    conversationId: string,
    ids: string[],
  ): Promise<StoredAttachment[]> {
    const result = await this.pool.query<AttachmentRow>(
      DATABASE_QUERIES.getAttachmentsForChat,
      [conversationId, ids, userId],
    );
    return result.rows.map((row) => ({
      ...mapAttachmentMetadata(row),
      content: row.content as Buffer,
      extractedText: row.extractedText ?? "",
    }));
  }

  async getAnalyticsSummary(userId: string): Promise<AnalyticsSummary> {
    const parameters = [userId];
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
