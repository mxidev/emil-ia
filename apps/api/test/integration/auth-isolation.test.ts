import { afterEach, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import type { AIProvider } from "../../src/provider.js";
import { createIntegrationApp } from "./fixture.js";

let fixture: Awaited<ReturnType<typeof createIntegrationApp>> | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const provider: AIProvider = {
  async generate() {
    return '{"code":"result = 42"}';
  },
  async *stream(request) {
    yield { type: "text", delta: "42" };
    yield {
      type: "done",
      executionId: crypto.randomUUID(),
      profile: request.profile,
      intent: request.intent,
    };
  },
};

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
  const boundary = "----emil-ia-auth-isolation-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([prefix, content, suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

it("does not expose one student's conversation to another authenticated student", async () => {
  fixture = await createIntegrationApp(provider);

  const ownerResponse = await fixture.inject({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Explica una ecuación" },
  });
  expect(ownerResponse.statusCode).toBe(200);
  const conversationId = ownerResponse.headers["x-conversation-id"];
  const upload = multipartPdf(await createPdf("Contenido privado del estudiante"));
  const ownerAttachment = await fixture.inject({
    method: "POST",
    url: `/api/conversations/${conversationId}/attachments`,
    headers: { "content-type": upload.contentType },
    payload: upload.body,
  });
  expect(ownerAttachment.statusCode).toBe(201);
  const attachmentId = ownerAttachment.json().id;

  const foreignHistory = await fixture.injectAsSecondUser({
    method: "GET",
    url: `/api/conversations/${conversationId}/messages`,
  });
  const foreignExport = await fixture.injectAsSecondUser({
    method: "GET",
    url: `/api/conversations/${conversationId}/export.md`,
  });
  const foreignFeedback = await fixture.injectAsSecondUser({
    method: "POST",
    url: `/api/conversations/${conversationId}/feedback`,
    payload: { rating: "positive" },
  });
  const secondOwnerResponse = await fixture.injectAsSecondUser({
    method: "POST",
    url: "/api/chat",
    payload: { content: "Mi propia conversación" },
  });
  const foreignChat = await fixture.injectAsSecondUser({
    method: "POST",
    url: "/api/chat",
    payload: {
      conversationId: secondOwnerResponse.headers["x-conversation-id"],
      content: "Intenta usar el PDF ajeno",
      attachmentIds: [attachmentId],
    },
  });
  const foreignAttachments = await fixture.injectAsSecondUser({
    method: "GET",
    url: `/api/conversations/${conversationId}/attachments`,
  });
  const foreignDelete = await fixture.injectAsSecondUser({
    method: "DELETE",
    url: `/api/conversations/${conversationId}/attachments/${attachmentId}`,
  });
  const secondHistory = await fixture.injectAsSecondUser({
    method: "GET",
    url: "/api/conversations",
  });
  const secondAnalytics = await fixture.injectAsSecondUser({
    method: "GET",
    url: "/api/analytics/summary",
  });

  expect(foreignHistory.statusCode).toBe(404);
  expect(foreignExport.statusCode).toBe(404);
  expect(foreignFeedback.statusCode).toBe(404);
  expect(foreignChat.statusCode).toBe(404);
  expect(foreignAttachments.statusCode).toBe(404);
  expect(foreignDelete.statusCode).toBe(404);
  expect(secondHistory.json()).toHaveLength(1);
  expect(secondAnalytics.json()).toMatchObject({
    conversations: 1,
    messages: 2,
    executions: 1,
  });
});
