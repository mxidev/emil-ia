export const DATABASE_QUERIES = {
  upsertAuthUser:
    'INSERT INTO users (id, display_name, auth_issuer, auth_subject) VALUES ($1, $2, $3, $4) ON CONFLICT (auth_issuer, auth_subject) WHERE auth_issuer IS NOT NULL AND auth_subject IS NOT NULL DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id, display_name AS "displayName", auth_issuer AS "authIssuer", auth_subject AS "authSubject"',
  findAuthUserById:
    'SELECT id, display_name AS "displayName", auth_issuer AS "authIssuer", auth_subject AS "authSubject" FROM users WHERE id = $1 AND auth_issuer IS NOT NULL AND auth_subject IS NOT NULL',
  createLoginTransaction:
    "INSERT INTO auth_login_transactions (state_hash, nonce, code_verifier_ciphertext, code_verifier_iv, code_verifier_auth_tag, redirect_uri, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
  consumeLoginTransaction:
    'UPDATE auth_login_transactions SET consumed_at = now() WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING state_hash AS "stateHash", nonce, code_verifier_ciphertext AS "codeVerifierCiphertext", code_verifier_iv AS "codeVerifierIv", code_verifier_auth_tag AS "codeVerifierAuthTag", redirect_uri AS "redirectUri", expires_at AS "expiresAt"',
  createSession:
    "INSERT INTO auth_sessions (session_hash, user_id, access_token_ciphertext, access_token_iv, access_token_auth_tag, refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag, access_token_expires_at, created_at, last_seen_at, expires_at, absolute_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
  findSession:
    'SELECT session_hash AS "sessionHash", user_id AS "userId", access_token_ciphertext AS "accessTokenCiphertext", access_token_iv AS "accessTokenIv", access_token_auth_tag AS "accessTokenAuthTag", refresh_token_ciphertext AS "refreshTokenCiphertext", refresh_token_iv AS "refreshTokenIv", refresh_token_auth_tag AS "refreshTokenAuthTag", access_token_expires_at AS "accessTokenExpiresAt", created_at AS "createdAt", last_seen_at AS "lastSeenAt", expires_at AS "expiresAt", absolute_expires_at AS "absoluteExpiresAt", revoked_at AS "revokedAt" FROM auth_sessions WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND absolute_expires_at > now()',
  touchSession:
    "UPDATE auth_sessions SET access_token_ciphertext = $2, access_token_iv = $3, access_token_auth_tag = $4, refresh_token_ciphertext = $5, refresh_token_iv = $6, refresh_token_auth_tag = $7, access_token_expires_at = $8, last_seen_at = $9, expires_at = $10 WHERE session_hash = $1 AND revoked_at IS NULL AND absolute_expires_at > now()",
  revokeSession:
    "UPDATE auth_sessions SET revoked_at = now() WHERE session_hash = $1 AND revoked_at IS NULL",
  revokeAllUserSessions:
    "UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
  createLocalUser:
    "INSERT INTO users (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
  createConversation:
    "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)",
  addMessage:
    "INSERT INTO messages (id, conversation_id, role, content) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND user_id = $5)",
  touchConversation:
    "UPDATE conversations SET updated_at = now() WHERE id = $1 AND user_id = $2",
  getMessages:
    "SELECT m.role, m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.conversation_id = $1 AND c.user_id = $2 ORDER BY m.created_at ASC",
  recordExecution:
    "INSERT INTO model_executions (id, conversation_id, provider, model, profile, intent, latency_ms, input_tokens, output_tokens, metadata) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10 WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND user_id = $11)",
  listConversations:
    'SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
  findConversationTitle:
    "SELECT title FROM conversations WHERE id = $1 AND user_id = $2",
  addFeedback:
    "INSERT INTO conversation_feedback (id, conversation_id, rating, category) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND user_id = $5)",
  createAttachment:
    'INSERT INTO attachments (id, conversation_id, filename, mime_type, byte_size, content, extracted_text, status, extraction_error) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9 WHERE EXISTS (SELECT 1 FROM conversations WHERE id = $2 AND user_id = $10) RETURNING id, conversation_id AS "conversationId", filename, mime_type AS "mimeType", byte_size AS "byteSize", status, extraction_error AS "extractionError", created_at AS "createdAt", updated_at AS "updatedAt"',
  listAttachments:
    'SELECT a.id, a.conversation_id AS "conversationId", a.filename, a.mime_type AS "mimeType", a.byte_size AS "byteSize", a.status, a.extraction_error AS "extractionError", a.created_at AS "createdAt", a.updated_at AS "updatedAt" FROM attachments a JOIN conversations c ON c.id = a.conversation_id WHERE a.conversation_id = $1 AND c.user_id = $2 ORDER BY a.created_at ASC',
  deleteAttachment:
    "DELETE FROM attachments a USING conversations c WHERE a.conversation_id = $1 AND a.id = $2 AND c.id = a.conversation_id AND c.user_id = $3 RETURNING a.id",
  getAttachmentsForChat:
    'SELECT a.id, a.conversation_id AS "conversationId", a.filename, a.mime_type AS "mimeType", a.byte_size AS "byteSize", a.content, a.extracted_text AS "extractedText", a.status, a.extraction_error AS "extractionError", a.created_at AS "createdAt", a.updated_at AS "updatedAt" FROM attachments a JOIN conversations c ON c.id = a.conversation_id WHERE a.conversation_id = $1 AND a.id = ANY($2::uuid[]) AND c.user_id = $3 ORDER BY a.created_at ASC, a.id ASC',
  countConversations:
    "SELECT count(*)::text AS count FROM conversations WHERE user_id = $1",
  countMessages:
    "SELECT count(*)::text AS count FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1",
  countExecutions:
    "SELECT count(*)::text AS count FROM model_executions e JOIN conversations c ON c.id = e.conversation_id WHERE c.user_id = $1",
  averageLatency:
    "SELECT round(avg(e.latency_ms))::text AS average FROM model_executions e JOIN conversations c ON c.id = e.conversation_id WHERE c.user_id = $1",
  feedbackCounts:
    "SELECT rating, count(*)::text AS count FROM conversation_feedback f JOIN conversations c ON c.id = f.conversation_id WHERE c.user_id = $1 GROUP BY rating",
} as const;
