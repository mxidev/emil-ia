import { drizzle } from "drizzle-orm/node-postgres";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { Pool } from "pg";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const modelExecutions = pgTable("model_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),
  profile: text("profile").notNull(),
  intent: text("intent").notNull(),
  latencyMs: integer("latency_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StoredMessage = { role: "user" | "assistant"; content: string };
const schema = `
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('user', 'assistant')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS model_executions (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, provider text NOT NULL, model text, profile text NOT NULL, intent text NOT NULL, latency_ms integer, input_tokens integer, output_tokens integer, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS conversation_feedback (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, rating text NOT NULL CHECK (rating IN ('positive', 'negative')), category text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);`;

export class DatabaseStore {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  private readonly userId = "00000000-0000-4000-8000-000000000001";

  async init() {
    await this.pool.query(schema);
    await this.pool.query(
      "INSERT INTO users (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [this.userId, "Usuario local"],
    );
  }

  async createConversation(id: string, title: string) {
    await this.pool.query(
      "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)",
      [id, this.userId, title.slice(0, 120)],
    );
  }

  async addMessage(conversationId: string, message: StoredMessage) {
    await this.pool.query(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)",
      [crypto.randomUUID(), conversationId, message.role, message.content],
    );
    await this.pool.query(
      "UPDATE conversations SET updated_at = now() WHERE id = $1",
      [conversationId],
    );
  }

  async getMessages(conversationId: string): Promise<StoredMessage[]> {
    const result = await this.pool.query<StoredMessage>(
      "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversationId],
    );
    return result.rows;
  }

  async recordExecution(data: {
    id: string;
    conversationId: string;
    profile: string;
    intent: string;
    latencyMs: number;
  }) {
    await this.pool.query(
      "INSERT INTO model_executions (id, conversation_id, provider, model, profile, intent, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        data.id,
        data.conversationId,
        process.env.OPENCODE_API_KEY ? "opencode" : "mock",
        process.env.OPENCODE_MODEL ?? null,
        data.profile,
        data.intent,
        data.latencyMs,
      ],
    );
  }

  async listConversations() {
    const result = await this.pool.query(
      'SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [this.userId],
    );
    return result.rows;
  }

  async exportMarkdown(conversationId: string) {
    const conversation = await this.pool.query<{ title: string }>(
      "SELECT title FROM conversations WHERE id = $1 AND user_id = $2",
      [conversationId, this.userId],
    );

    if (!conversation.rowCount) return null;
    
    const messages = await this.getMessages(conversationId);
    return `# ${conversation.rows[0].title}\n\n${messages.map((message) => `## ${message.role === "user" ? "Usuario" : "Emil-IA"}\n\n${message.content}`).join("\n\n")}\n`;
  }

  async addFeedback(conversationId: string, rating: "positive" | "negative", category?: string) {
    await this.pool.query("INSERT INTO conversation_feedback (id, conversation_id, rating, category) VALUES ($1, $2, $3, $4)", [crypto.randomUUID(), conversationId, rating, category ?? null]);
  }
}

export function createDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool);
}
