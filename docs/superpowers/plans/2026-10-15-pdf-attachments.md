# PDF Conversation Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload PDFs to a conversation, persist the original bytes in PostgreSQL, extract text synchronously, and include selected documents in later streamed chat requests.

**Architecture:** A thin multipart route delegates to `AttachmentService`, which validates the upload, calls a `PdfTextExtractor`, and persists metadata, bytes, and extracted text through `ConversationRepository`. Chat requests carry attachment IDs; the backend verifies conversation ownership and adds bounded, delimited extracted text to provider messages. Angular services own upload, reload, selection, and request state.

**Tech Stack:** Fastify 5, `@fastify/multipart` 10.x, `pdf-parse` 2.x, TypeScript, Zod, PostgreSQL `bytea`, Angular 20 signals, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-15-pdf-attachments-design.md`

## Global Constraints

- Support PDF files only; images and OCR are out of scope.
- Store the complete original PDF in PostgreSQL `bytea`; never expose bytes from metadata endpoints or logs.
- Process one PDF synchronously during upload.
- Enforce `PDF_MAX_BYTES=10485760` by default and at most five attachment IDs per chat request.
- Cap extracted text at 80,000 characters by default through `PDF_MAX_TEXT_CHARS=80000`; both limits use bounded integer parsing.
- Keep SQL in `apps/api/src/database/queries.ts` and keep routes/components thin.
- Preserve streaming, profiles, provider token limits, conversation isolation, and existing unrelated working-tree changes.

## Review Focus

- A valid PDF with an empty text layer returns a persisted failed status and is excluded from model context; test in the extractor/service task.
- A forged MIME type or non-`%PDF-` payload is rejected before persistence; test in the service/route task.
- An attachment ID from another conversation is rejected without exposing metadata or text; test in the chat/integration task.
- A long extracted document is truncated to the configured limit without breaking the surrounding chat context; test in the context task.
- Reloading a conversation restores attachment metadata and selected IDs without sending PDF bytes to the browser or provider; test in API and frontend tasks.

### Task 1: Contracts, limits, and database schema

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/interfaces/persistence.interface.ts`
- Modify: `apps/api/src/database/schema.ts`
- Modify: `apps/api/migrations/0001_initial.sql`
- Test: `apps/api/test/chat.routes.test.ts`

**Interfaces:**
- Produce `AttachmentStatus = "ready" | "failed"` and `AttachmentMetadata` in shared contracts without Node-specific `Buffer` types.
- Extend `ChatRequestSchema` with optional `attachmentIds: z.array(z.string().uuid()).max(5)`.
- Add `StoredAttachment` and `NewAttachment` persistence types with `Buffer` content, extracted text, status, and optional extraction error.

- [ ] **Step 1: Write failing contract tests** for accepting valid attachment IDs, rejecting more than five IDs, and rejecting non-UUID values.
- [ ] **Step 2: Run the focused tests** with `npm run test --workspace @emil-ia/api`; verify the new assertions fail because `attachmentIds` is not yet part of the schema.
- [ ] **Step 3: Add the contracts and persistence types** with the exact five-ID limit and status union.
- [ ] **Step 4: Add the `attachments` table** to both schema sources with UUID primary key, conversation foreign key with cascade, filename, MIME type, byte size, `bytea` content, extracted text, status/error, timestamps, and a conversation index.
- [ ] **Step 5: Run API typecheck and focused tests**; expect the contract tests to pass and no existing test regressions.
- [ ] **Step 6: Commit** with `Add PDF attachment contracts and schema`.

### Task 2: PDF extraction module

**Files:**
- Create: `apps/api/src/services/pdf-text-extractor.ts`
- Create: `apps/api/test/pdf-text-extractor.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produce `export interface PdfTextExtractor { extract(content: Buffer): Promise<string>; }`.
- Produce `export class PdfParseTextExtractor implements PdfTextExtractor` using `pdf-parse` and normalizing extracted whitespace.
- Extraction failures must throw a typed error that the attachment service can convert into a persisted `failed` status.

- [ ] **Step 1: Add tests first** using a small valid PDF fixture, malformed bytes, and a PDF with no extractable text; assert extracted text, rejection, and empty output respectively.
- [ ] **Step 2: Run `npx vitest run test/pdf-text-extractor.test.ts`** from `apps/api`; verify the tests fail because the module does not exist.
- [ ] **Step 3: Install `pdf-parse@^2.4.5`** and implement the adapter behind the interface; keep parser-specific types and cleanup inside this file.
- [ ] **Step 4: Run the focused extractor tests**; verify valid text is returned, malformed input rejects, and empty text is represented as an empty result.
- [ ] **Step 5: Commit** with `Add PDF text extraction adapter`.

### Task 3: Attachment repository and application service

**Files:**
- Modify: `apps/api/src/database/queries.ts`
- Modify: `apps/api/src/repositories/conversation.repository.ts`
- Create: `apps/api/src/services/attachment.service.ts`
- Create: `apps/api/test/attachment.service.test.ts`
- Modify: `apps/api/test/conversation.repository.test.ts`

**Interfaces:**
- Add repository methods:
  - `createAttachment(data: NewAttachment): Promise<AttachmentMetadata>`
  - `listAttachments(conversationId: string): Promise<AttachmentMetadata[]>`
  - `getAttachmentsForChat(conversationId: string, ids: string[]): Promise<StoredAttachment[]>`
- Add `AttachmentService.upload(conversationId: string, file: { filename: string; mimetype: string; content: Buffer }): Promise<AttachmentMetadata>`.
- Add `AttachmentService.list(conversationId: string): Promise<AttachmentMetadata[]>`.
- Add `AttachmentService.getContext(conversationId: string, ids: string[]): Promise<AIRequest["messages"]>`; it rejects IDs not belonging to the conversation and excludes failed attachments.

- [ ] **Step 1: Write service tests first** for valid PDF validation, 10 MiB rejection, MIME/signature mismatch, five-ID enforcement, extraction success, extraction failure persistence, list metadata, and cross-conversation rejection.
- [ ] **Step 2: Run `npx vitest run test/attachment.service.test.ts`**; verify failure because the service and repository methods are absent.
- [ ] **Step 3: Add attachment SQL only to `DATABASE_QUERIES`** and implement repository mapping; never select `content` in `listAttachments`.
- [ ] **Step 4: Implement `AttachmentService`** with `PDF_MAX_BYTES = 10 * 1024 * 1024`, configurable `PDF_MAX_TEXT_CHARS` defaulting to 80,000, `%PDF-` signature validation, sanitized filename metadata, and typed access errors.
- [ ] **Step 5: Build document context** as delimited system/reference messages containing attachment ID and filename, truncated before insertion, with an explicit instruction that document text is untrusted reference material.
- [ ] **Step 6: Run service, repository, and API typecheck tests**; verify all validation and isolation assertions pass.
- [ ] **Step 7: Commit** with `Add PDF attachment persistence service`.

### Task 4: Multipart attachment routes and API wiring

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/routes/attachment.routes.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/integration/fixture.ts`
- Create: `apps/api/test/attachment.routes.test.ts`
- Modify: `apps/api/test/integration/chat.test.ts`

**Interfaces:**
- Register `@fastify/multipart` with a 10 MiB file limit and one-file route usage.
- Register `POST /api/conversations/:id/attachments` returning attachment metadata/status.
- Register `GET /api/conversations/:id/attachments` returning metadata only.
- Route dependencies are `AttachmentService` and `FastifyInstance`; routes do not contain SQL or PDF parsing.

- [ ] **Step 1: Write route tests first** for valid multipart upload, invalid content, oversized upload, metadata-only listing, unknown conversation, and extraction failure response.
- [ ] **Step 2: Run the focused route tests**; verify they fail because multipart registration and routes are absent.
- [ ] **Step 3: Install `@fastify/multipart@^10.1.3`**, register it in `server.ts` and the integration fixture, and consume the single file stream into a bounded buffer.
- [ ] **Step 4: Implement thin attachment routes** that translate service errors into 400/404/413 responses and return only metadata.
- [ ] **Step 5: Extend the integration test** to upload a deterministic PDF through Fastify, reload its metadata, and confirm no binary content is returned.
- [ ] **Step 6: Run route and integration tests** with PostgreSQL and sandbox services; verify the complete upload flow passes.
- [ ] **Step 7: Commit** with `Add PDF attachment API routes`.

### Task 5: Include selected PDF text in streamed chat

**Files:**
- Modify: `apps/api/src/routes/chat.routes.ts`
- Modify: `apps/api/src/services/chat.service.ts`
- Modify: `apps/api/test/chat.service.test.ts`
- Modify: `apps/api/test/chat.routes.test.ts`
- Modify: `apps/api/test/integration/chat.test.ts`

**Interfaces:**
- Change `ChatService.prepare(content, requestedConversationId?, attachmentIds?: string[])` to load attachment context after validating the conversation and before math verification/provider streaming.
- Keep `AIRequest.messages` unchanged; represent extracted PDF context as text messages.

- [ ] **Step 1: Write failing service tests** asserting selected PDF text reaches both math verification and final provider messages, failed attachments are skipped, long text is capped, and unrelated conversation text is rejected.
- [ ] **Step 2: Run the focused service tests**; verify they fail because `prepare` ignores attachment IDs.
- [ ] **Step 3: Extend the route call and `ChatService.prepare`** to pass attachment IDs, merge document context with existing history, and preserve the current streaming/footer flow.
- [ ] **Step 4: Add route assertions** for the request contract and error response when attachment access fails before SSE headers are written.
- [ ] **Step 5: Add an integration scenario** that uploads a PDF, reloads the conversation, sends a follow-up with its ID, and verifies the provider sees extracted text while a second conversation cannot.
- [ ] **Step 6: Run API unit, integration, and typecheck commands**; verify streaming still emits token and done events.
- [ ] **Step 7: Commit** with `Use PDF context in streamed chat`.

### Task 6: Angular attachment state and UI

**Files:**
- Modify: `apps/web/src/app/interfaces/chat.interface.ts`
- Modify: `apps/web/src/app/interfaces/conversation.interface.ts`
- Modify: `apps/web/src/app/services/conversation-api.service.ts`
- Modify: `apps/web/src/app/services/chat-state.service.ts`
- Modify: `apps/web/src/app/components/chat/chat.component.ts`
- Modify: `apps/web/src/app/components/chat/chat.component.html`
- Modify: `apps/web/src/app/components/chat/chat.component.css`
- Test: `apps/web/test/chat-state.test.mjs`

**Interfaces:**
- Add frontend `Attachment` metadata matching the shared contract.
- Add `ConversationApiService.uploadAttachment(conversationId: string, file: File): Promise<Attachment>` and `attachments(conversationId: string): Promise<Attachment[]>`.
- Extend `ChatApiService` request payload with `attachmentIds?: string[]`.
- Add `ChatStateService.attachments`, `selectedAttachmentIds`, `uploadAttachment(file)`, and reload behavior that restores metadata and selection for the active conversation.

- [ ] **Step 1: Write frontend tests first** for successful upload, upload error notification, conversation reload restoring metadata, and `send()` forwarding selected IDs.
- [ ] **Step 2: Run `npm run test --workspace @emil-ia/web`**; verify the new assertions fail because attachment state and API methods are absent.
- [ ] **Step 3: Implement multipart upload and metadata retrieval in `ConversationApiService`**; keep URL construction and HTTP handling there.
- [ ] **Step 4: Update `ChatStateService`** to clear attachments on new conversation, load them on selection, track selected IDs, and include them in `ChatApiService.stream` requests.
- [ ] **Step 5: Add a PDF file input, selected attachment chips/status, and removal-from-selection action** to `ChatComponent`; keep file parsing and HTTP calls in services.
- [ ] **Step 6: Run frontend tests, typecheck, and build**; verify existing chat, notification, Markdown, and export behavior remains green.
- [ ] **Step 7: Commit** with `Add PDF attachments to Angular chat`.

### Task 7: Final verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-10-15-pdf-attachments-design.md` only if implementation decisions need clarification

- [ ] **Step 1: Document `PDF_MAX_BYTES`, `PDF_MAX_TEXT_CHARS`, multipart setup, and local PostgreSQL storage implications** without documenting secrets or raw file paths.
- [ ] **Step 2: Run the full validation set:**
  - `npm run typecheck --workspace @emil-ia/api`
  - `npm run test --workspace @emil-ia/api`
  - `npm run test:integration --workspace @emil-ia/api`
  - `npm run typecheck --workspace @emil-ia/web`
  - `npm run build --workspace @emil-ia/web`
  - `npm test`
- [ ] **Step 3: Run `git diff --check` and inspect status** to ensure only intended files are staged.
- [ ] **Step 4: Commit** with `Document PDF attachment configuration`.
