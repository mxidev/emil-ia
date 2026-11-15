ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_issuer text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_subject text;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_identity_idx ON users(auth_issuer, auth_subject) WHERE auth_issuer IS NOT NULL AND auth_subject IS NOT NULL;
CREATE TABLE IF NOT EXISTS auth_login_transactions (state_hash text PRIMARY KEY, nonce text NOT NULL, code_verifier_ciphertext text NOT NULL, code_verifier_iv text NOT NULL, code_verifier_auth_tag text NOT NULL, redirect_uri text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE INDEX IF NOT EXISTS auth_login_transactions_expiry_idx ON auth_login_transactions(expires_at);
CREATE TABLE IF NOT EXISTS auth_sessions (session_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, access_token_ciphertext text NOT NULL, access_token_iv text NOT NULL, access_token_auth_tag text NOT NULL, refresh_token_ciphertext text NOT NULL, refresh_token_iv text NOT NULL, refresh_token_auth_tag text NOT NULL, access_token_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, absolute_expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, revoked_at);
