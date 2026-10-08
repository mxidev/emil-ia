import { Injectable } from "@angular/core";
import { API_BASE_URL } from "../constants/api.constants";
import type {
  ChatRequest,
  ChatResult,
  ChatStreamHandlers,
} from "../interfaces/chat.interface";

@Injectable({ providedIn: "root" })
export class ChatApiService {
  async stream(
    request: ChatRequest,
    handlers: ChatStreamHandlers,
  ): Promise<ChatResult> {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok || !response.body) {
      throw new Error(`La API respondió ${response.status}`);
    }

    const conversationId =
      response.headers.get("x-conversation-id") ?? undefined;
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) this.handleEvent(event, handlers);
    }
    return { conversationId };
  }

  private handleEvent(event: string, handlers: ChatStreamHandlers): void {
    const eventType = event
      .split("\n")
      .find((line) => line.startsWith("event: "))
      ?.slice(7);
    const data = event.split("\n").find((line) => line.startsWith("data: "));
    
    if (!data) return;
    const payload = JSON.parse(data.slice(6)) as {
      delta?: string;
      message?: string;
    };
    
    if (eventType === "token" && payload.delta) handlers.onToken(payload.delta);
    if (eventType === "error")
      handlers.onError(payload.message ?? "Error desconocido");
  }
}
