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

  constructor(private readonly chatState: ChatStateService) {}

  ngOnInit(): void {
    void this.chatState.initialize();
  }

  toggleHistory(): void {
    this.historyExpanded.update((expanded) => !expanded);
  }
}
