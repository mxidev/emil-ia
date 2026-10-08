export const DATABASE_QUERIES = {
  createLocalUser:
    "INSERT INTO users (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
  createConversation:
    "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)",
  addMessage:
    "INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)",
  touchConversation:
    "UPDATE conversations SET updated_at = now() WHERE id = $1",
  getMessages:
    "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
  recordExecution:
    "INSERT INTO model_executions (id, conversation_id, provider, model, profile, intent, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
  listConversations:
    'SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
  findConversationTitle:
    "SELECT title FROM conversations WHERE id = $1 AND user_id = $2",
  addFeedback:
    "INSERT INTO conversation_feedback (id, conversation_id, rating, category) VALUES ($1, $2, $3, $4)",
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
