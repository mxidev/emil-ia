import PDFDocument from "pdfkit";
import type { ConversationRepository } from "../repositories/conversation.repository.js";

export class ExportService {
  constructor(private readonly repository: ConversationRepository) {}

  async createMarkdown(conversationId: string): Promise<string | null> {
    const title = await this.repository.findConversationTitle(conversationId);
    if (!title) return null;
    
    const messages = await this.repository.getMessages(conversationId);
    const content = messages
      .map(
        (message) =>
          `## ${message.role === "user" ? "Usuario" : "Emil-IA"}\n\n${message.content}`,
      )
      .join("\n\n");
    return `# ${title}\n\n${content}\n`;
  }

  async createPdf(conversationId: string): Promise<Buffer | null> {
    const markdown = await this.createMarkdown(conversationId);
    if (!markdown) return null;
    
    const document = new PDFDocument({ margin: 54 });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve) => {
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
    });
    document.fontSize(11).text(markdown.replace(/^# /, ""));
    document.end();
    return finished;
  }
}
