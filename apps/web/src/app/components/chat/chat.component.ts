import { ChangeDetectionStrategy, Component } from "@angular/core";
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
  ) {}

  render(content: string): string {
    return this.markdown.render(content);
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
}
