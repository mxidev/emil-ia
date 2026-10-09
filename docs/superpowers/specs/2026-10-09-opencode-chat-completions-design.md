# OpenCode Chat Completions Design

## Goal

Make the existing OpenCode Go Chat Completions adapter reliable and observable for production-like use without adding an SDK or supporting Responses/Anthropic protocols.

## Scope

- Keep the `AIProvider` abstraction and the current HTTP/SSE API unchanged except for additive token fields in the final SSE event.
- Use `https://opencode.ai/zen/go/v1` as the provider fallback URL.
- Add `OPENCODE_CONNECT_TIMEOUT_SECONDS` (default `15`, allowed `1`–`60`), `OPENCODE_STREAM_IDLE_TIMEOUT_SECONDS` (default `60`, allowed `5`–`300`), and `OPENCODE_MAX_TOKENS` (default `2048`, allowed `128`–`8192`). Invalid values fall back to their defaults.
- Apply the connection timeout only until response headers arrive. Apply the idle timeout to each pending streamed read; timeout cancels the reader and produces a clear provider error.
- Send `max_tokens` and `stream_options: { include_usage: true }` with Chat Completions requests. The non-streaming calculation planner uses the same output limit and existing 10-second planning deadline.

## Streaming and Telemetry

- Parse SSE records across arbitrary chunk boundaries; process `data:` payloads only after a blank-line record delimiter.
- Emit text deltas in order, capture the last `usage` object from a streamed payload, and accept `[DONE]` as the termination marker.
- Treat upstream HTTP failures, provider `error` payloads, malformed terminal data, connection timeout, and idle timeout as route-level SSE errors. Never persist an assistant response without a provider `done` event.
- Extend the internal `done` event with optional `inputTokens` and `outputTokens`. Persist both in the existing `model_executions` columns; retain `null` when the provider omits usage.
- Start route latency measurement before `chat.prepare()` so it includes planning and sandbox verification.

## Out of Scope

- Responses API, Anthropic Messages API, SDK adoption, retries, billing, and real-provider integration tests requiring credentials.

## Acceptance

- Mocked provider tests cover fragmented SSE, `[DONE]`, usage persistence, HTTP/provider errors, connection timeout, idle timeout, invalid configuration, and token limit payloads.
- API and web typechecks/tests/build remain green. Documentation explains Chat Completions-only support and new environment variables.
