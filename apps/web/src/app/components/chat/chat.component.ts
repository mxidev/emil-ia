import {
  ChangeDetectionStrategy,
  Component,
  effect,
  EffectRef,
  Injector,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { ChatStateService } from "../../services/chat-state.service";
import { MarkdownService } from "../../services/markdown.service";
import { ThinkingStatusService } from "../../services/thinking-status.service";

@Component({
  selector: "app-chat",
  standalone: false,
  templateUrl: "./chat.component.html",
  styleUrl: "./chat.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, OnDestroy {
  attachmentsExpanded = false;
  private loadingEffect: EffectRef | undefined;

  constructor(
    readonly state: ChatStateService,
    private readonly markdown: MarkdownService,
    private readonly sanitizer: DomSanitizer,
    readonly thinking: ThinkingStatusService = new ThinkingStatusService(),
    private readonly injector?: Injector,
  ) {}

  ngOnInit(): void {
    if (!this.injector) return;
    this.loadingEffect = effect(
      () => {
        if (this.state.loading()) this.thinking.start();
        else this.thinking.stop();
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.loadingEffect?.destroy();
    this.thinking.stop();
  }

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

  toggleAttachments(): void {
    this.attachmentsExpanded = !this.attachmentsExpanded;
  }

  onAttachmentKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Escape") return;
    keyboardEvent.preventDefault();
    this.attachmentsExpanded = false;
  }

  removeAttachment(event: Event, attachmentId: string): void {
    event.stopPropagation();
    if (!window.confirm("¿Eliminar este PDF de la conversación?")) return;
    void this.state.deleteAttachment(attachmentId);
  }
}
