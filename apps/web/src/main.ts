import { bootstrapApplication } from "@angular/platform-browser";
import { Component, ChangeDetectionStrategy, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { marked } from "marked";
import katex from "katex";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="shell">
    <header>
      <div class="brand">
        <span class="mark">∑</span>
        <div>
          <h1>Emil-IA</h1>
          <small>Asistente académico de ingeniería</small>
        </div>
      </div>
      <span class="status">● Local</span>
    </header>
    <nav class="history" aria-label="Conversaciones">
      <div class="history-heading">
        <span>Conversaciones</span
        ><button type="button" (click)="newConversation()">Nueva</button>
      </div>
      <button
        type="button"
        class="conversation"
        *ngFor="let conversation of conversations()"
        [class.selected]="conversation.id === conversationId()"
        (click)="selectConversation(conversation.id)"
      >
        {{ conversation.title }}
      </button>
    </nav>
    <section class="chat">
      <div class="welcome" *ngIf="messages().length === 0">
        <div class="hero">¿Qué quieres entender hoy?</div>
        <p>
          Pregunta sobre matemáticas, ingeniería o programación. El sistema
          elegirá la estrategia adecuada y mostrará el razonamiento con Markdown
          y LaTeX.
        </p>
        <div class="suggestions">
          <button
            (click)="
              use(
                'Demuestra que la suma de dos funciones continuas es continua'
              )
            "
          >
            Demostración matemática</button
          ><button
            (click)="use('Resuelve este sistema de ecuaciones paso a paso')"
          >
            Resolver un ejercicio</button
          ><button (click)="use('Explica qué es un autovalor')">
            Explicación conceptual
          </button>
        </div>
      </div>
      <article
        *ngFor="let message of messages()"
        [class.user]="message.role === 'user'"
        [class.assistant]="message.role === 'assistant'"
      >
        <span class="role">{{
          message.role === "user" ? "Tú" : "Emil-IA"
        }}</span>
        <div
          class="content"
          [innerHTML]="renderMarkdown(message.content)"
        ></div>
      </article>
      <div class="typing" *ngIf="loading()">Emil-IA está pensando…</div>
    </section>
    <form class="composer" (submit)="$event.preventDefault(); send()">
      <textarea
        [value]="draft()"
        (input)="draft.set($any($event.target).value)"
        (keydown.enter)="onEnter($event)"
        placeholder="Escribe tu consulta…"
        rows="1"
      ></textarea
      ><button type="submit" [disabled]="loading() || !draft().trim()">
        Enviar <span>↵</span>
      </button>
    </form>
  </main>`,
  styles: [
    `
      :host {
        display: block;
      }
      * {
        box-sizing: border-box;
      }
      .shell {
        max-width: 900px;
        margin: 0 auto;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        padding: 24px 28px;
        color: #172033;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0 28px;
      }
      .brand {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .mark {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: #2457e6;
        color: white;
        font-size: 23px;
      }
      h1 {
        font-size: 19px;
        margin: 0;
      }
      small {
        color: #6b7280;
      }
      .status {
        font-size: 12px;
        color: #16a34a;
      }
      .history {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .history-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        color: #667085;
        font-size: 12px;
        font-weight: 700;
      }
      .history-heading button,
      .conversation {
        border: 1px solid #d9dfeb;
        background: #fff;
        border-radius: 8px;
        padding: 7px 10px;
        cursor: pointer;
        color: #344054;
      }
      .conversation {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 220px;
      }
      .conversation.selected {
        border-color: #2457e6;
        color: #2457e6;
      }
      .chat {
        flex: 1;
        padding: 42px 8px 24px;
      }
      .welcome {
        text-align: center;
        max-width: 640px;
        margin: 80px auto 0;
      }
      .hero {
        font-size: 34px;
        font-weight: 700;
        letter-spacing: -1px;
      }
      .welcome p {
        color: #667085;
        line-height: 1.6;
      }
      .suggestions {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 26px;
      }
      .suggestions button {
        border: 1px solid #d9dfeb;
        background: #fff;
        border-radius: 10px;
        padding: 10px 13px;
        color: #344054;
        cursor: pointer;
      }
      .suggestions button:hover {
        border-color: #2457e6;
        color: #2457e6;
      }
      article {
        max-width: 80%;
        margin: 18px 0;
        line-height: 1.6;
      }
      .user {
        margin-left: auto;
        background: #eef3ff;
        border-radius: 16px 16px 4px 16px;
        padding: 13px 16px;
      }
      .assistant {
        padding: 4px 0;
      }
      .role {
        display: block;
        font-size: 11px;
        font-weight: 700;
        color: #667085;
        margin-bottom: 4px;
      }
      .content {
        white-space: pre-wrap;
      }
      .typing {
        color: #98a2b3;
        font-size: 13px;
      }
      .composer {
        display: flex;
        gap: 10px;
        border: 1px solid #d9dfeb;
        border-radius: 16px;
        padding: 8px;
        background: #fff;
        box-shadow: 0 5px 24px #1d2a4d0d;
      }
      .composer textarea {
        resize: none;
        border: 0;
        outline: 0;
        flex: 1;
        padding: 11px 9px;
        font: inherit;
        max-height: 120px;
      }
      .composer button {
        border: 0;
        background: #2457e6;
        color: #fff;
        border-radius: 10px;
        padding: 0 16px;
        font-weight: 600;
        cursor: pointer;
      }
      .composer button:disabled {
        opacity: 0.45;
        cursor: default;
      }
      @media (max-width: 600px) {
        .shell {
          padding: 16px;
        }
        .hero {
          font-size: 28px;
        }
        article {
          max-width: 94%;
        }
      }
    `,
  ],
})
export class AppComponent {
  messages = signal<Message[]>([]);
  conversations = signal<Conversation[]>([]);
  conversationId = signal<string | undefined>(undefined);
  draft = signal("");
  loading = signal(false);

  renderMarkdown(content: string): string {
    const tokens = content.split(
      /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g,
    );
    return tokens
      .map((token) => {
        if (token.startsWith("$$") && token.endsWith("$$"))
          return katex.renderToString(token.slice(2, -2), {
            displayMode: true,
            throwOnError: false,
          });
        
        if (token.startsWith("$") && token.endsWith("$"))
          return katex.renderToString(token.slice(1, -1), {
            throwOnError: false,
          });
        
        if (token.startsWith("\\(") && token.endsWith("\\)"))
          return katex.renderToString(token.slice(2, -2), {
            throwOnError: false,
          });
        
        if (token.startsWith("\\[") && token.endsWith("\\]"))
          return katex.renderToString(token.slice(2, -2), {
            displayMode: true,
            throwOnError: false,
          });
        
        return marked.parse(token, { async: false }) as string;
      })
      .join("");
  }

  constructor() {
    void this.loadConversations();
  }

  async loadConversations() {
    const response = await fetch("http://localhost:3000/api/conversations");
    if (response.ok) this.conversations.set(await response.json());
  }

  newConversation() {
    this.conversationId.set(undefined);
    this.messages.set([]);
  }

  async selectConversation(id: string) {
    const response = await fetch(
      `http://localhost:3000/api/conversations/${id}/messages`,
    );
    if (!response.ok) return;
    this.conversationId.set(id);
    this.messages.set(await response.json());
  }

  use(text: string) {
    this.draft.set(text);
  }

  onEnter(event: Event) {
    const key = event as KeyboardEvent;
    if (!key.shiftKey) {
      key.preventDefault();
      this.send();
    }
  }

  async send() {
    const content = this.draft().trim();
    if (!content || this.loading()) return;

    this.messages.update((items) => [
      ...items,
      { role: "user", content },
      { role: "assistant", content: "" },
    ]);

    this.draft.set("");
    this.loading.set(true);

    try {
      const response = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          conversationId: this.conversationId(),
        }),
      });
      if (!response.body) throw new Error("La API no devolvió un stream");
      const returnedConversationId = response.headers.get("x-conversation-id");
      if (returnedConversationId)
        this.conversationId.set(returnedConversationId);

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
        for (const event of events) {
          const data = event
            .split("\n")
            .find((line) => line.startsWith("data: "));
          if (!data) continue;

          const payload = JSON.parse(data.slice(6));
          if (payload.delta)
            this.messages.update((items) =>
              items.map((m, i) =>
                i === items.length - 1
                  ? { ...m, content: m.content + payload.delta }
                  : m,
              ),
            );
        }
      }
      await this.loadConversations();
    } catch (error) {
      this.messages.update((items) =>
        items.map((m, i) =>
          i === items.length - 1
            ? {
                ...m,
                content: `No se pudo completar la consulta: ${error instanceof Error ? error.message : "error desconocido"}`,
              }
            : m,
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }
}

bootstrapApplication(AppComponent).catch(console.error);
