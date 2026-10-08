import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { ChatStateService } from "./services/chat-state.service";

@Component({
  selector: "app-root",
  standalone: false,
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  constructor(private readonly chatState: ChatStateService) {}

  ngOnInit(): void {
    void this.chatState.initialize();
  }
}
