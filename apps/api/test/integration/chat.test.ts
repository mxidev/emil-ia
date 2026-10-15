import { afterEach, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import type { AIRequest } from "@emil-ia/contracts";
import type { AIProvider } from "../../src/provider.js";
import { createIntegrationApp } from "./fixture.js";

let fixture: Awaited<ReturnType<typeof createIntegrationApp>> | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const provider: AIProvider = {
  async generate() {
    return '{"code":"result = 6 * 7"}';
  },
  async *stream(request) {
    yield { type: "text", delta: "42" };
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
      inputTokens: 12,
      outputTokens: 3,
    };
  },
};

function contextualProvider(requests: AIRequest[]): AIProvider {
  return {
    async generate() {
      return null;
    },
    async *stream(request) {
      requests.push({ ...request, messages: [...request.messages] });
      const hasPreviousAnswer = request.messages.some(
        (message) =>
          message.role === "assistant" && message.content === "Primer resultado",
      );
      yield {
        type: "text",
        delta: hasPreviousAnswer ? "Respuesta con contexto" : "Primer resultado",
      };
      yield {
        type: "done",
        executionId: crypto.randomUUID(),
        profile: request.profile,
        intent: request.intent,
      };
    },
  };
}

async function createPdf(text: string): Promise<Buffer> {
  const document = new PDFDocument();
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  document.text(text);
  document.end();
  return finished;
}

function multipartPdf(content: Buffer): { body: Buffer; contentType: string } {
  const boundary = "----emil-ia-integration-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([prefix, content, suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

it("persists a sandbox-verified answer that can be retrieved through history", async () => {
  fixture = await createIntegrationApp(provider);
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Calcula 6 * 7" },
  });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("event: done");
  expect(response.body).not.toContain("event: error");
  expect(response.body).toContain('"inputTokens":12');
  const history = await fixture.app.inject({
    url: `/api/conversations/${response.headers["x-conversation-id"]}/messages`,
  });
  expect(history.statusCode).toBe(200);
  expect(history.json()).toEqual([
    { role: "user", content: "Calcula 6 * 7" },
    {
      role: "assistant",
      content:
        "42\n\n> Cálculo verificado automáticamente en el sandbox. Resultado: `42`.",
    },
  ]);
  const analytics = await fixture.app.inject({ url: "/api/analytics/summary" });
  expect(analytics.json()).toMatchObject({
    conversations: 1,
    messages: 2,
    executions: 1,
  });
});

it("persists a PDF and reloads metadata without returning binary content", async () => {
  fixture = await createIntegrationApp(provider);
  const conversation = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Prepara una conversación para un PDF" },
  });
  const conversationId = conversation.headers["x-conversation-id"];
  const upload = multipartPdf(await createPdf("El método de Euler aproxima soluciones."));

  const uploaded = await fixture.app.inject({
    method: "POST",
    url: `/api/conversations/${conversationId}/attachments`,
    headers: { "content-type": upload.contentType },
    payload: upload.body,
  });
  expect(uploaded.statusCode).toBe(201);
  expect(uploaded.json()).toMatchObject({
    conversationId,
    filename: "reference.pdf",
    status: "ready",
  });

  const listed = await fixture.app.inject({
    method: "GET",
    url: `/api/conversations/${conversationId}/attachments`,
  });
  expect(listed.statusCode).toBe(200);
  expect(listed.json()).toEqual([uploaded.json()]);
  expect(listed.body).not.toContain("%PDF-");
});

it("keeps a warning in history when the real sandbox rejects the plan", async () => {
  fixture = await createIntegrationApp({
    ...provider,
    async generate() {
      return '{"code":"import os\\nresult = 42"}';
    },
  });
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Calcula 6 * 7" },
  });
  expect(response.body).toContain("event: done");
  const history = await fixture.app.inject({
    url: `/api/conversations/${response.headers["x-conversation-id"]}/messages`,
  });
  expect(history.json()).toEqual([
    { role: "user", content: "Calcula 6 * 7" },
    {
      role: "assistant",
      content:
        "42\n\n> No fue posible verificar automáticamente este cálculo; revisa el resultado antes de usarlo.",
    },
  ]);
});

it("does not save a partial assistant answer or execution when the provider fails", async () => {
  fixture = await createIntegrationApp({
    ...provider,
    async *stream() {
      yield { type: "text", delta: "Respuesta incompleta" };
      throw new Error("Provider connection interrupted");
    },
  });
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica un vector" },
  });
  expect(response.body).toContain("Respuesta incompleta");
  expect(response.body).toContain("event: error");
  expect(response.body).not.toContain("event: done");
  const history = await fixture.app.inject({
    url: `/api/conversations/${response.headers["x-conversation-id"]}/messages`,
  });
  expect(history.json()).toEqual([
    { role: "user", content: "Explica un vector" },
  ]);
  const analytics = await fixture.app.inject({ url: "/api/analytics/summary" });
  expect(analytics.json()).toMatchObject({
    conversations: 1,
    messages: 1,
    executions: 0,
  });
});

it("reconstructs conversation context after history is loaded again", async () => {
  const requests: AIRequest[] = [];
  fixture = await createIntegrationApp(contextualProvider(requests));

  const first = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica la idea principal" },
  });
  const conversationId = first.headers["x-conversation-id"];

  const history = await fixture.app.inject({
    url: `/api/conversations/${conversationId}/messages`,
  });
  expect(history.json()).toEqual([
    { role: "user", content: "Explica la idea principal" },
    { role: "assistant", content: "Primer resultado" },
  ]);

  const followUp = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId,
      content: "Ahora resume esa respuesta",
    },
  });

  expect(followUp.statusCode).toBe(200);
  expect(followUp.body).toContain('"delta":"Respuesta con contexto"');
  expect(followUp.body).toContain("event: done");
  expect(requests[1].messages).toEqual([
    { role: "user", content: "Explica la idea principal" },
    { role: "assistant", content: "Primer resultado" },
    { role: "user", content: "Ahora resume esa respuesta" },
  ]);
});

it("keeps provider context isolated between conversations", async () => {
  const requests: AIRequest[] = [];
  fixture = await createIntegrationApp(contextualProvider(requests));

  const firstConversation = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica el concepto A" },
  });
  const firstId = firstConversation.headers["x-conversation-id"];

  const secondConversation = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica el concepto B" },
  });
  const secondId = secondConversation.headers["x-conversation-id"];

  await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId: firstId,
      content: "Compara con el concepto inicial",
    },
  });

  expect(firstId).not.toBe(secondId);
  expect(requests[2].messages).toEqual([
    { role: "user", content: "Explica el concepto A" },
    { role: "assistant", content: "Primer resultado" },
    { role: "user", content: "Compara con el concepto inicial" },
  ]);
  expect(requests[2].messages).not.toContainEqual({
    role: "user",
    content: "Explica el concepto B",
  });
});

it("uses a reloaded PDF in follow-up chat and blocks another conversation", async () => {
  const requests: AIRequest[] = [];
  fixture = await createIntegrationApp(contextualProvider(requests));

  const first = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Crea una conversación sobre métodos numéricos" },
  });
  const firstId = first.headers["x-conversation-id"];
  const upload = multipartPdf(await createPdf("El método de Euler aproxima soluciones."));
  const uploaded = await fixture.app.inject({
    method: "POST",
    url: `/api/conversations/${firstId}/attachments`,
    headers: { "content-type": upload.contentType },
    payload: upload.body,
  });
  const attachmentId = uploaded.json().id;

  const reloaded = await fixture.app.inject({
    method: "GET",
    url: `/api/conversations/${firstId}/attachments`,
  });
  expect(reloaded.json()).toEqual([uploaded.json()]);

  const followUp = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId: firstId,
      content: "Resume el documento",
      attachmentIds: [attachmentId],
    },
  });
  expect(followUp.statusCode).toBe(200);
  expect(requests[1].messages).toContainEqual(
    expect.objectContaining({
      role: "system",
      content: expect.stringContaining("El método de Euler"),
    }),
  );

  const second = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Crea otra conversación" },
  });
  const secondId = second.headers["x-conversation-id"];
  const requestCount = requests.length;
  const forbidden = await fixture.app.inject({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId: secondId,
      content: "Resume el documento ajeno",
      attachmentIds: [attachmentId],
    },
  });

  expect(forbidden.statusCode).toBe(404);
  expect(forbidden.body).not.toContain("event: token");
  expect(requests).toHaveLength(requestCount);
});
