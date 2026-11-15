export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_issuer text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_subject text;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_identity_idx ON users(auth_issuer, auth_subject) WHERE auth_issuer IS NOT NULL AND auth_subject IS NOT NULL;
CREATE TABLE IF NOT EXISTS conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('user', 'assistant')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS model_executions (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, provider text NOT NULL, model text, profile text NOT NULL, intent text NOT NULL, latency_ms integer, input_tokens integer, output_tokens integer, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS conversation_feedback (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, rating text NOT NULL CHECK (rating IN ('positive', 'negative')), category text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS attachments (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, filename text NOT NULL, mime_type text NOT NULL, byte_size integer NOT NULL CHECK (byte_size > 0), content bytea NOT NULL, extracted_text text NOT NULL DEFAULT '', status text NOT NULL CHECK (status IN ('ready', 'failed')), extraction_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS attachments_conversation_idx ON attachments(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS auth_login_transactions (state_hash text PRIMARY KEY, nonce text NOT NULL, code_verifier_ciphertext text NOT NULL, code_verifier_iv text NOT NULL, code_verifier_auth_tag text NOT NULL, redirect_uri text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE INDEX IF NOT EXISTS auth_login_transactions_expiry_idx ON auth_login_transactions(expires_at);
CREATE TABLE IF NOT EXISTS auth_sessions (session_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, access_token_ciphertext text NOT NULL, access_token_iv text NOT NULL, access_token_auth_tag text NOT NULL, refresh_token_ciphertext text NOT NULL, refresh_token_iv text NOT NULL, refresh_token_auth_tag text NOT NULL, access_token_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, absolute_expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, revoked_at);
`;
