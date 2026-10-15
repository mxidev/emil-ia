# PDF Attachments for Conversations

## Goal

Allow a user to attach PDF documents to a conversation, extract their text,
and explicitly include selected documents in later chat requests. Images and
OCR are out of scope for this iteration.

## Decisions

- Store the original PDF in PostgreSQL `bytea`, together with metadata and
  extracted text. This keeps the local MVP self-contained and avoids a new
  storage service.
- Process one PDF synchronously during upload. The API returns the attachment
  only when extraction has completed or reports a clear extraction failure.
- Enforce a 10 MB per-file limit and at most five attachment IDs per chat
  request. Extracted text is capped by a separate configurable character
  limit before entering model context.
- Treat extracted text as untrusted reference material. Delimit it in the
  model context and never treat instructions inside a PDF as application
  instructions.

## Backend design

Add an `attachments` table with `id`, `conversation_id`, original filename,
MIME type, byte size, PDF bytes, extracted text, extraction status/error, and
timestamps. The conversation foreign key cascades attachment cleanup.

`AttachmentService` owns validation, extraction, and orchestration. A
`PdfTextExtractor` interface hides the parser library, while
`ConversationRepository` owns all attachment SQL. Routes remain thin:

- `POST /api/conversations/:id/attachments` accepts one multipart PDF and
  returns metadata plus extraction status.
- `GET /api/conversations/:id/attachments` returns metadata only, never bytes.
- `POST /api/chat` accepts optional `attachmentIds`; the service verifies that
  every ID belongs to the requested conversation before loading extracted text.

The chat context assembler adds selected, ready documents to the existing
conversation context. It sends extracted text to the provider, never the raw
binary PDF, and preserves streaming, profiles, token limits, and conversation
isolation.

## Frontend design

`ConversationApiService` handles multipart upload and metadata retrieval.
`ChatStateService` owns attachment state, selected IDs, reload behavior, and
upload errors. The chat component only presents a file input, attachment
chips/status, and actions; it does not parse files or build requests.

## Errors and security

Reject non-PDF MIME types, invalid PDF signatures, oversized files, unknown
conversation IDs, cross-conversation attachment IDs, and more than five IDs.
Do not expose database bytes through list endpoints or logs. PDFs with no
extractable text remain stored with a failed status and are excluded from
model context.

## Testing and completion

Cover extractor success/failure, upload validation, persistence, metadata-only
listing, cross-conversation rejection, context inclusion after reload, and
streaming with an attached document. Completion requires a PDF uploaded to a
conversation to be retrievable after reload and usable in a follow-up query,
while another conversation cannot access it.
