import { ChangeDetectionStrategy, Component } from "@angular/core";
import type { NotificationKind } from "../../services/notification-store";
import { NotificationService } from "../../services/notification.service";

@Component({
  selector: "app-notification-center",
  standalone: false,
  templateUrl: "./notification-center.component.html",
  styleUrl: "./notification-center.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenterComponent {
  readonly labels: Record<NotificationKind, string> = {
    error: "Error",
    warning: "Advertencia",
    success: "Listo",
    info: "Información",
    tip: "Consejo",
  };

  constructor(readonly notifications: NotificationService) {}
}
