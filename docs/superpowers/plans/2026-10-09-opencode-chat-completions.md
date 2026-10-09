# OpenCode Chat Completions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenCode Go Chat Completions adapter bounded, resilient to fragmented SSE, and observable through persisted token usage.

**Architecture:** Keep the custom `AIProvider`. `OpenCodeProvider` owns validated environment configuration, request limits, connection timeout, idle stream timeout, and SSE decoding. The route passes additive usage fields through `ChatService` into the existing execution columns.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Zod, Vitest, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-09-opencode-chat-completions-design.md`

## Global Constraints

- Support only OpenCode Go Chat Completions; no SDK, Responses, Anthropic, retries, billing, or credentialed provider test.
- Default URL: `https://opencode.ai/zen/go/v1`.
- Defaults/ranges: connect `15` s (`1`–`60`), idle `60` s (`5`–`300`), max tokens `2048` (`128`–`8192`); invalid environment values use defaults.
- Keep HTTP/SSE compatibility; token fields on `done` are optional and additive.
- Persist no assistant response when upstream fails before a provider `done` event.

## Review Focus

- Split `data:` lines and blank-line SSE delimiters must not lose or merge text.
- A provider omitting usage must store token columns as `null`.
- Timeout must cancel the pending stream and surface an SSE error, not hang the request.
- Existing mock provider and sandbox flow must retain their current behavior.
- Provider error payloads must never be persisted as assistant content.

---

### Task 1: Bounded OpenCode streaming adapter

**Files:**
- Modify: `apps/api/src/provider.ts`
- Modify: `apps/api/test/provider.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `AIEvent` `done` variant with optional `inputTokens?: number` and `outputTokens?: number`.
- Produces: `OpenCodeProvider` configured by validated connect, idle, and output-token limits.

- [ ] Write failing provider tests for default URL/config fallback, `max_tokens` and streaming usage request payload, fragmented SSE text, `[DONE]`, usage extraction, provider error payload, connection timeout, and idle read timeout.
- [ ] Run `npm run test --workspace @emil-ia/api -- provider.test.ts`; confirm the parser/config behaviors fail.
- [ ] Implement bounded request setup, record-delimited SSE parsing, usage extraction, safe error conversion, and cancellation of idle reads.
- [ ] Run the focused provider tests and API typecheck.
- [ ] Commit with `Harden OpenCode streaming adapter`.

### Task 2: Persist provider usage and inclusive latency

**Files:**
- Modify: `apps/api/src/services/chat.service.ts`
- Modify: `apps/api/src/interfaces/persistence.interface.ts`
- Modify: `apps/api/src/repositories/conversation.repository.ts`
- Modify: `apps/api/src/database/queries.ts`
- Modify: `apps/api/src/routes/chat.routes.ts`
- Modify: `apps/api/test/chat.service.test.ts`
- Modify: `apps/api/test/conversation.repository.test.ts`
- Create: `apps/api/test/chat.routes.test.ts`

**Interfaces:**
- Consumes: optional token fields from `AIEvent` `done`.
- Produces: `ModelExecutionRecord.inputTokens?: number` and `outputTokens?: number`; SQL writes the existing `input_tokens` and `output_tokens` columns.

- [ ] Write failing tests proving token usage reaches the repository, absent usage stores `null`, and route latency includes `prepare()` time.
- [ ] Run focused tests; confirm token parameters and inclusive latency are absent/wrong before implementation.
- [ ] Thread usage through `ChatService.complete`, repository SQL, and the `done` route branch; start timing before `chat.prepare()`.
- [ ] Run API suite and typecheck.
- [ ] Commit with `Record OpenCode usage telemetry`.

### Task 3: Configuration documentation and final validation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Document the three OpenCode limits, defaults, valid ranges, and Chat Completions-only constraint.
- [ ] Run `npm test`, API/web typechecks, Angular build, and `git diff --check`.
- [ ] Commit with `Document OpenCode streaming limits`.
