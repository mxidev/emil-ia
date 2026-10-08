export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('user', 'assistant')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS model_executions (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, provider text NOT NULL, model text, profile text NOT NULL, intent text NOT NULL, latency_ms integer, input_tokens integer, output_tokens integer, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS conversation_feedback (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, rating text NOT NULL CHECK (rating IN ('positive', 'negative')), category text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
`;
