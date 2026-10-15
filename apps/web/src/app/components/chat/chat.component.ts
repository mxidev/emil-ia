import { ChangeDetectionStrategy, Component } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { ChatStateService } from "../../services/chat-state.service";
import { MarkdownService } from "../../services/markdown.service";

@Component({
  selector: "app-chat",
  standalone: false,
  templateUrl: "./chat.component.html",
  styleUrl: "./chat.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  constructor(
    readonly state: ChatStateService,
    private readonly markdown: MarkdownService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  render(content: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.markdown.render(content));
  }

  useSuggestion(text: string): void {
    this.state.draft.set(text);
  }

  onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      void this.state.send();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void this.state.uploadAttachment(file);
  }
}
