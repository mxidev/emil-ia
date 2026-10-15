import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
} from "@angular/core";
import type { NotificationKind } from "../../interfaces/notification.interface";
import { NotificationService } from "../../services/notification.service";

export function shouldMoveFocusIntoNotificationCenter(
  focusedNoticeId: number | null,
  closingNoticeIds: readonly number[],
): boolean {
  return focusedNoticeId !== null && closingNoticeIds.includes(focusedNoticeId);
}

@Component({
  selector: "app-notification-center",
  standalone: false,
  templateUrl: "./notification-center.component.html",
  styleUrl: "./notification-center.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenterComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly restoreFocusWhenNoticeCloses = effect(() => {
    const closingIds = this.notifications
      .notifications()
      .filter((notice) => notice.closing)
      .map((notice) => notice.id);
    if (closingIds.length === 0 || typeof document === "undefined") return;

    const activeNotice = document.activeElement?.closest<HTMLElement>(
      "[data-notice-id]",
    );
    const activeNoticeId = activeNotice?.dataset["noticeId"];
    if (
      activeNoticeId !== undefined &&
      shouldMoveFocusIntoNotificationCenter(
        Number(activeNoticeId),
        closingIds,
      )
    ) {
      this.host.nativeElement.focus();
    }
  });

  readonly labels: Record<NotificationKind, string> = {
    error: "Error",
    warning: "Advertencia",
    success: "Listo",
    info: "Información",
    tip: "Consejo",
  };

  constructor(readonly notifications: NotificationService) {}
}
