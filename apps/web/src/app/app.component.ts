import { ChangeDetectionStrategy, Component, OnInit, signal } from "@angular/core";
import { ChatStateService } from "./services/chat-state.service";
import { AuthService } from "./services/auth.service";

@Component({
  selector: "app-root",
  standalone: false,
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  readonly historyExpanded = signal(true);
  readonly historyMotionEnabled = signal(false);

  constructor(
    private readonly chatState: ChatStateService,
    readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    void this.initialize();
  }

  login(): void {
    this.auth.login();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.chatState.startNewConversation();
  }

  private async initialize(): Promise<void> {
    await this.auth.initialize();
    if (this.auth.status() === "authenticated") {
      await this.chatState.initialize();
    }
  }

  toggleHistory(event: MouseEvent): void {
    this.historyMotionEnabled.set(event.detail > 0);
    this.historyExpanded.update((expanded) => !expanded);
  }
}
