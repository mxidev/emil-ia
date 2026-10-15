import { Injectable } from "@angular/core";
import katex from "katex";
import { marked } from "marked";

interface MathToken {
  placeholder: string;
  html: string;
  displayMode: boolean;
}

@Injectable({ providedIn: "root" })
export class MarkdownService {
  private readonly tokenPattern =
    /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)|(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;

  render(content: string): string {
    const mathTokens: MathToken[] = [];
    const markdown = content.replace(
      this.tokenPattern,
      (token, codeToken: string | undefined, mathToken: string | undefined) => {
        if (!mathToken) return codeToken ?? token;

        const displayMode =
          mathToken.startsWith("$$") || mathToken.startsWith("\\[");
        const expression = displayMode
          ? mathToken.slice(2, -2)
          : mathToken.startsWith("$")
            ? mathToken.slice(1, -1)
            : mathToken.slice(2, -2);
        const placeholder = `MATHBLOCK${mathTokens.length}TOKEN`;
        mathTokens.push({
          placeholder,
          displayMode,
          html: this.renderMath(expression, displayMode),
        });
        return placeholder;
      },
    );

    let rendered = marked.parse(markdown, { async: false }) as string;
    for (const token of mathTokens) {
      if (token.displayMode) {
        const paragraph = new RegExp(
          `<p>\\s*${token.placeholder}\\s*</p>`,
          "g",
        );
        rendered = rendered.replace(
          paragraph,
          `<div class="math-block">${token.html}</div>`,
        );
      }
      rendered = rendered.replaceAll(token.placeholder, token.html);
    }
    return rendered;
  }

  private renderMath(expression: string, displayMode = false): string {
    return katex.renderToString(expression, {
      displayMode,
      throwOnError: false,
    });
  }
}
