import assert from "node:assert/strict";
import test from "node:test";
import { ChatStateService } from "../src/app/services/chat-state.service.ts";
import { NotificationStore } from "../src/app/services/notification-store.ts";

function setup(overrides = {}) {
  const notices = new NotificationStore({
    schedule: () => 1,
    cancel: () => {},
  });
  const chatApi = {
    stream: async () => ({ conversationId: "conversation-1" }),
    ...overrides.chatApi,
  };
  const conversationApi = {
    list: async () => [],
    messages: async () => [],
    attachments: async () => [],
    uploadAttachment: async () => ({
      id: "attachment-1",
      conversationId: "conversation-1",
      filename: "notes.pdf",
      mimeType: "application/pdf",
      byteSize: 16,
      status: "ready",
      extractionError: null,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    }),
    deleteAttachment: async () => {},
    download: async () => {},
    feedback: async () => {},
    ...overrides.conversationApi,
  };
  const state = new ChatStateService(chatApi, conversationApi, notices);
  return { state, notices };
}

test("a failed send keeps an explanation and publishes one error notice", async () => {
  const { state, notices } = setup({
    chatApi: {
      stream: async () => {
        throw new Error("Falló la red");
      },
    },
  });
  state.draft.set("Hola");

  await state.send();

  assert.match(state.messages()[1].content, /Falló la red/);
  assert.equal(state.loading(), false);
  assert.deepEqual(
    notices.notifications().map(({ kind, message }) => ({ kind, message })),
    [{ kind: "error", message: "Falló la red" }],
  );
});

test("an SSE error publishes one notice even when the stream completes", async () => {
  const { state, notices } = setup({
    chatApi: {
      stream: async (_request, handlers) => {
        handlers.onError("Modelo no disponible");
        return { conversationId: "conversation-1" };
      },
    },
  });
  state.draft.set("Hola");

  await state.send();

  assert.deepEqual(
    notices.notifications().map(({ kind, message }) => ({ kind, message })),
    [{ kind: "error", message: "Modelo no disponible" }],
  );
});

test("an SSE error followed by a rejected stream publishes only one notice", async () => {
  const { state, notices } = setup({
    chatApi: {
      stream: async (_request, handlers) => {
        handlers.onError("Modelo no disponible");
        throw new Error("ConexiÃ³n cerrada");
      },
    },
  });
  state.draft.set("Hola");

  await state.send();

  assert.deepEqual(
    notices.notifications().map(({ kind, message }) => ({ kind, message })),
    [{ kind: "error", message: "Modelo no disponible" }],
  );
});

test("successful export and feedback publish confirmations", async () => {
  const { state, notices } = setup();
  state.conversationId.set("conversation-1");

  await state.exportConversation("pdf");
  await state.sendFeedback("positive");

  assert.equal(state.feedbackSent(), true);
  assert.deepEqual(
    notices.notifications().map((notice) => notice.kind),
    ["success", "success"],
  );
});

test("failed export publishes an error without a success", async () => {
  const { state, notices } = setup({
    conversationApi: {
      download: async () => {
        throw new Error("No se pudo exportar");
      },
    },
  });
  state.conversationId.set("conversation-1");

  await state.exportConversation("md");

  assert.deepEqual(
    notices.notifications().map(({ kind, message }) => ({ kind, message })),
    [{ kind: "error", message: "No se pudo exportar" }],
  );
});

test("a history loading failure publishes an error", async () => {
  const { state, notices } = setup({
    conversationApi: {
      list: async () => {
        throw new Error("Sin conexión");
      },
    },
  });

  await state.loadConversations();

  assert.deepEqual(
    notices.notifications().map(({ kind, message }) => ({ kind, message })),
    [{ kind: "error", message: "Sin conexión" }],
  );
});

test("successful PDF upload stores metadata and selects the attachment", async () => {
  const uploaded = [];
  const { state } = setup({
    conversationApi: {
      uploadAttachment: async (_id, file) => {
        uploaded.push(file.name);
        return {
          id: "attachment-1",
          conversationId: "conversation-1",
          filename: file.name,
          mimeType: "application/pdf",
          byteSize: file.size,
          status: "ready",
          extractionError: null,
          createdAt: "2026-10-15T00:00:00.000Z",
          updatedAt: "2026-10-15T00:00:00.000Z",
        };
      },
    },
  });
  state.conversationId.set("conversation-1");

  await state.uploadAttachment(new File(["%PDF-1.7"], "notes.pdf"));

  assert.deepEqual(uploaded, ["notes.pdf"]);
  assert.deepEqual(state.attachments().map(({ id }) => id), ["attachment-1"]);
  assert.deepEqual(state.selectedAttachmentIds(), ["attachment-1"]);
});

test("failed PDF upload publishes one error notice", async () => {
  const { state, notices } = setup({
    conversationApi: {
      uploadAttachment: async () => {
        throw new Error("PDF inválido");
      },
    },
  });
  state.conversationId.set("conversation-1");

  await state.uploadAttachment(new File(["not pdf"], "notes.pdf"));

  assert.deepEqual(
    notices.notifications().map(({ kind, message }) => ({ kind, message })),
    [{ kind: "error", message: "PDF inválido" }],
  );
});

test("conversation reload restores PDF metadata and ready selections", async () => {
  const attachment = {
    id: "attachment-1",
    conversationId: "conversation-1",
    filename: "notes.pdf",
    mimeType: "application/pdf",
    byteSize: 16,
    status: "ready",
    extractionError: null,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
  };
  const { state } = setup({
    conversationApi: {
      messages: async () => [{ role: "user", content: "Hola" }],
      attachments: async () => [attachment],
    },
  });

  await state.selectConversation("conversation-1");

  assert.deepEqual(state.attachments(), [attachment]);
  assert.deepEqual(state.selectedAttachmentIds(), ["attachment-1"]);
});

test("send forwards selected PDF IDs to the chat API", async () => {
  let sentRequest;
  const { state } = setup({
    chatApi: {
      stream: async (request) => {
        sentRequest = request;
        return { conversationId: "conversation-1" };
      },
    },
  });
  state.conversationId.set("conversation-1");
  state.selectedAttachmentIds.set(["attachment-1"]);
  state.draft.set("Resume el PDF");

  await state.send();

  assert.deepEqual(sentRequest, {
    content: "Resume el PDF",
    conversationId: "conversation-1",
    attachmentIds: ["attachment-1"],
  });
});

test("deletes a PDF from the conversation and current selection", async () => {
  const deleted = [];
  const attachment = {
    id: "attachment-1",
    conversationId: "conversation-1",
    filename: "notes.pdf",
    mimeType: "application/pdf",
    byteSize: 16,
    status: "ready",
    extractionError: null,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
  };
  const { state } = setup({
    conversationApi: {
      deleteAttachment: async (conversationId, attachmentId) => {
        deleted.push([conversationId, attachmentId]);
      },
    },
  });
  state.conversationId.set("conversation-1");
  state.attachments.set([attachment]);
  state.selectedAttachmentIds.set([attachment.id]);

  await state.deleteAttachment(attachment.id);

  assert.deepEqual(deleted, [["conversation-1", "attachment-1"]]);
  assert.deepEqual(state.attachments(), []);
  assert.deepEqual(state.selectedAttachmentIds(), []);
});
