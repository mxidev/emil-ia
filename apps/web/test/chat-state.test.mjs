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
