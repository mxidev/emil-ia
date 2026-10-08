import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

export const users = pgTable('users', { id: uuid('id').defaultRandom().primaryKey(), displayName: text('display_name').notNull(), createdAt: timestamp('created_at').defaultNow().notNull() });
export const conversations = pgTable('conversations', { id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull(), title: text('title').notNull(), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull() });
export const messages = pgTable('messages', { id: uuid('id').defaultRandom().primaryKey(), conversationId: uuid('conversation_id').notNull(), role: text('role').notNull(), content: text('content').notNull(), createdAt: timestamp('created_at').defaultNow().notNull() });
export const modelExecutions = pgTable('model_executions', { id: uuid('id').defaultRandom().primaryKey(), conversationId: uuid('conversation_id').notNull(), provider: text('provider').notNull(), model: text('model'), profile: text('profile').notNull(), intent: text('intent').notNull(), latencyMs: integer('latency_ms'), inputTokens: integer('input_tokens'), outputTokens: integer('output_tokens'), metadata: jsonb('metadata'), createdAt: timestamp('created_at').defaultNow().notNull() });

export function createDb() { const pool = new Pool({ connectionString: process.env.DATABASE_URL }); return drizzle(pool); }
