import { ChangeDetectionStrategy, Component, OnInit, signal } from "@angular/core";
import { ChatStateService } from "./services/chat-state.service";

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

  constructor(private readonly chatState: ChatStateService) {}

  ngOnInit(): void {
    void this.chatState.initialize();
  }

  toggleHistory(event: MouseEvent): void {
    this.historyMotionEnabled.set(event.detail > 0);
    this.historyExpanded.update((expanded) => !expanded);
  }
}
