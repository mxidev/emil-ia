# PDF Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the total PDF context sent to the provider at 200,000 characters and make PDF selection explicit after conversation reload.

**Architecture:** Keep PDF context assembly inside `AttachmentService`, adding a configurable global budget on top of the existing per-document limit and five-ID validation. Keep Angular metadata loading unchanged, but clear selected IDs when a conversation is reloaded so only explicit user selection is sent; uploading a new ready PDF remains selected because choosing the file is already an explicit action.

**Tech Stack:** Fastify 5, TypeScript, Zod, PostgreSQL, Angular 20 signals, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-15-pdf-context-budget-design.md`

## Global Constraints

- The global PDF context budget is exactly `200000` characters by default.
- The existing maximum of five attachment IDs per chat request remains enforced.
- The existing individual `PDF_MAX_TEXT_CHARS` default remains `80000`.
- The new environment variable is `PDF_MAX_CONTEXT_CHARS`; invalid values use the default.
- Reloading a conversation restores attachment metadata but starts with no selected attachment IDs.
- Do not persist selection in PostgreSQL or `localStorage`.
- Do not add dependencies or change PDF storage, extraction, or conversation isolation.
- The budget includes generated attachment framing and reference text; delimiters must remain complete.

## Review Focus

- Several ready PDFs whose combined framing and text exceed 200,000 characters must never exceed the budget; test the final message lengths.
- The attachment that crosses the remaining budget must be truncated without losing its closing delimiter; test the exact boundary.
- A budget too small for another attachment's framing must omit that attachment rather than emit malformed or empty context; test omission.
- Invalid or missing `PDF_MAX_CONTEXT_CHARS` must use 200,000; test configuration parsing.
- Reloading a conversation with ready and failed PDFs must show metadata but select none; test manual selection still forwards only the chosen ready ID.

---

### Task 1: Enforce the global backend context budget

**Files:**
- Modify: `apps/api/src/services/attachment.service.ts`
- Test: `apps/api/test/attachment.service.test.ts`

**Interfaces:**
- Produce `DEFAULT_PDF_MAX_CONTEXT_CHARS = 200_000`.
- Produce `configuredPdfMaxContextChars(): number` using the existing safe-positive-integer configuration pattern.
- Extend `AttachmentService` options with `maxContextChars?: number` while preserving existing options and method signatures.

- [x] **Step 1: Write failing tests** in `attachment.service.test.ts` for a combined context budget, exact delimiter preservation, omission when only framing remains, and invalid configuration fallback.
- [x] **Step 2: Run the focused test file** with `npm run test --workspace @emil-ia/api -- --run test/attachment.service.test.ts`; verify the new assertions fail because the global option and parser are absent.
- [x] **Step 3: Implement the global budget** in `AttachmentService.getContext()` by iterating ready attachments in repository order, rendering each complete delimited message, truncating only extracted text to the remaining budget, and skipping later attachments when their framing cannot fit.
- [x] **Step 4: Add `PDF_MAX_CONTEXT_CHARS` parsing** with default 200,000 and inject the parsed value through the existing service constructor without changing the five-ID or per-file limits.
- [x] **Step 5: Run the focused tests** again; expect all attachment service tests to pass.
- [x] **Step 6: Commit** with `Bound aggregate PDF context size`.

### Task 2: Make reload selection explicit in Angular

**Files:**
- Modify: `apps/web/src/app/services/chat-state.service.ts`
- Test: `apps/web/test/chat-state.test.mjs`

**Interfaces:**
- Keep `ChatStateService.attachments` and `selectedAttachmentIds` unchanged.
- `selectConversation(id)` must set `selectedAttachmentIds` to `[]` after loading metadata.
- Existing upload behavior continues selecting a newly uploaded ready PDF because file selection is an explicit user action.

- [x] **Step 1: Update the reload test** to expect ready and failed metadata to load with an empty selection, then explicitly select the ready ID and assert that `send()` forwards only that ID.
- [x] **Step 2: Run the focused test** with `npm run test --workspace @emil-ia/web -- --test-name-pattern "conversation reload"`; verify it fails against the current auto-selection behavior.
- [x] **Step 3: Change `selectConversation()`** to clear selected IDs while preserving attachment metadata, failed attachment display, and all existing toggle/upload/delete behavior.
- [x] **Step 4: Run the full web test suite**; expect all tests to pass.
- [x] **Step 5: Commit** with `Require explicit PDF selection after reload`.

### Task 3: Document configuration and verify the complete change

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Document `PDF_MAX_CONTEXT_CHARS=200000` next to the existing PDF limits.
- Explain that reloading a conversation leaves PDFs unselected and that selected PDF context is capped globally at 200,000 characters.

- [x] **Step 1: Update `.env.example` and README** with the new variable, default, and explicit-selection behavior without exposing secrets or raw files.
- [x] **Step 2: Run API typecheck and tests** with `npm run typecheck --workspace @emil-ia/api` and `npm run test --workspace @emil-ia/api`.
- [x] **Step 3: Run web typecheck, tests, and build** with `npm run typecheck --workspace @emil-ia/web`, `npm run test --workspace @emil-ia/web`, and `npm run build --workspace @emil-ia/web`.
- [x] **Step 4: Run integration tests and repository checks** with `npm run test:integration --workspace @emil-ia/api`, `npm test`, and `git diff --check`.
- [x] **Step 5: Inspect the final diff and status**, confirming only the planned implementation, tests, documentation, and spec/plan files changed.
- [x] **Step 6: Commit** with `Document PDF context budget configuration`.
