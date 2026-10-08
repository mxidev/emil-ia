import { ChangeDetectionStrategy, Component } from "@angular/core";
import { ChatStateService } from "../../services/chat-state.service";

@Component({
  selector: "app-conversation-history",
  standalone: false,
  templateUrl: "./conversation-history.component.html",
  styleUrl: "./conversation-history.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationHistoryComponent {
  constructor(readonly state: ChatStateService) {}
}
