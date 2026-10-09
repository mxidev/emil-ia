# Automatic Math Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically verify `SOLVE`, `VERIFY`, and `COMPUTE` requests in the Python sandbox while preserving chat streaming, persistence, and exports.

**Architecture:** The provider gains a non-streaming generation operation used by a focused `MathVerificationService`. `ChatService` runs that service before the final provider stream, injects a successful result as system context, appends a deterministic Markdown footer, and records a safe status in execution metadata.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Zod, Vitest, PostgreSQL, FastAPI sandbox.

**Spec:** Approved conversational design from 2026-10-09; no separate spec file exists.

## Global Constraints

- Activate verification only for `SOLVE`, `VERIFY`, and `COMPUTE`.
- Execute at most one generated Python plan and never retry automatically.
- Never persist generated Python or expose internal sandbox errors to the user.
- Preserve the public HTTP/SSE protocol and require no Angular UI changes.
- Do not modify `.env` or `.codex/`.

## Review Focus

- Malformed or fenced planner output must not reach the sandbox.
- Missing or oversized `result` values must degrade to an explicit warning.
- Sandbox failures must not prevent the final model response.
- The verification footer must be emitted and persisted before `done`.
- SQL metadata must remain nullable and preserve existing execution records.

---

### Task 1: Provider non-streaming generation

**Files:**
- Create: `apps/api/test/provider.test.ts`
- Modify: `apps/api/src/provider.ts`

**Interfaces:**
- Produces: `AIProvider.generate(request: AIRequest): Promise<string | null>`.
- Produces: `MockProvider.generate()` returns `null`; `OpenCodeProvider.generate()` returns assistant text from a non-streaming Chat Completions response.

- [ ] Write failing tests for mock absence, request payload, successful text extraction, and invalid responses.
- [ ] Run the provider tests and verify the missing method/behavior fails.
- [ ] Implement the smallest shared request logic and `generate` methods.
- [ ] Run the API suite and typecheck.
- [ ] Commit with `Add provider calculation planning`.

### Task 2: Math verification service and sandbox validation

**Files:**
- Create: `apps/api/src/services/math-verification.service.ts`
- Create: `apps/api/test/math-verification.service.test.ts`
- Modify: `apps/api/src/sandbox.ts`
- Create: `apps/api/test/sandbox.test.ts`

**Interfaces:**
- Consumes: `AIProvider.generate()` and `SandboxClient.run()`.
- Produces: `SandboxStatus = "not_applicable" | "success" | "planning_failed" | "sandbox_failed" | "skipped_mock"`.
- Produces: `verify(messages, route): Promise<{ status; systemMessage?; footer? }>`.

- [ ] Write failing tests for routing, success, malformed plans, missing/oversized results, provider absence, and sandbox failure.
- [ ] Run focused tests and verify failures are caused by missing behavior.
- [ ] Implement Zod plan/response validation and the one-attempt verifier.
- [ ] Run the API suite and typecheck.
- [ ] Commit with `Add automatic math verification service`.

### Task 3: Chat streaming and execution metadata

**Files:**
- Create: `apps/api/test/chat.service.test.ts`
- Modify: `apps/api/src/services/chat.service.ts`
- Modify: `apps/api/src/interfaces/persistence.interface.ts`
- Modify: `apps/api/src/repositories/conversation.repository.ts`
- Modify: `apps/api/src/database/queries.ts`
- Modify: `apps/api/src/routes/chat.routes.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `MathVerificationService.verify()`.
- Produces: a wrapped event stream ordered as provider text, optional footer text, then `done`.
- Produces: `ModelExecutionRecord.metadata?: { sandbox: { status: SandboxStatus } }` stored in the existing `metadata` JSONB column.

- [ ] Write failing service tests for system context, footer ordering, failure degradation, and persisted metadata.
- [ ] Run focused tests and verify failures.
- [ ] Wire verification into chat preparation, completion, repository SQL, routes, and server composition.
- [ ] Run the API suite and typecheck.
- [ ] Commit with `Integrate sandbox verification into chat`.

### Task 4: Configuration, documentation, and full verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Documents: Chat Completions-compatible OpenCode Go base URL and model limitation.

- [ ] Update the example base URL to `https://opencode.ai/zen/go/v1` and document the supported protocol.
- [ ] Run API tests/typecheck, web typecheck/build, and `git diff --check`.
- [ ] Commit with `Document sandbox verification setup`.
