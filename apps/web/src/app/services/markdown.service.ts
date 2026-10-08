import { Injectable } from "@angular/core";
import katex from "katex";
import { marked } from "marked";

@Injectable({ providedIn: "root" })
export class MarkdownService {
  render(content: string): string {
    const tokens = content.split(
      /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g,
    );
    return tokens.map((token) => this.renderToken(token)).join("");
  }

  private renderToken(token: string): string {
    if (token.startsWith("$$") && token.endsWith("$$")) {
      return this.renderMath(token.slice(2, -2), true);
    }
    if (token.startsWith("$") && token.endsWith("$")) {
      return this.renderMath(token.slice(1, -1));
    }
    if (token.startsWith("\\(") && token.endsWith("\\)")) {
      return this.renderMath(token.slice(2, -2));
    }
    if (token.startsWith("\\[") && token.endsWith("\\]")) {
      return this.renderMath(token.slice(2, -2), true);
    }
    return marked.parse(token, { async: false }) as string;
  }

  private renderMath(expression: string, displayMode = false): string {
    return katex.renderToString(expression, {
      displayMode,
      throwOnError: false,
    });
  }
}
