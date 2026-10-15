import { signal } from "@angular/core";
import type {
  NotificationClock,
  NotificationKind,
  NotificationRecord,
  NotificationTimerHandle,
} from "../interfaces/notification.interface";

const defaultClock: NotificationClock = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

export class NotificationStore {
  readonly notifications = signal<NotificationRecord[]>([]);

  private nextId = 1;
  private readonly clock: NotificationClock;
  private readonly timers = new Map<
    number,
    { expiry?: NotificationTimerHandle; removal?: NotificationTimerHandle }
  >();

  constructor(clock: NotificationClock = defaultClock) {
    this.clock = clock;
  }

  show(kind: NotificationKind, message: string): number {
    const current = this.notifications();
    if (current.length === 3) this.remove(current[0].id);

    const id = this.nextId++;
    this.notifications.update((notices) => [
      ...notices,
      { id, kind, message, closing: false },
    ]);

    if (kind !== "info" && kind !== "tip") {
      this.timers.set(id, {
        expiry: this.clock.schedule(() => this.dismiss(id), 10_000),
      });
    }

    return id;
  }

  dismiss(id: number): void {
    const notice = this.notifications().find((item) => item.id === id);
    if (!notice || notice.closing) return;

    const timers = this.timers.get(id) ?? {};
    if (timers.expiry) this.clock.cancel(timers.expiry);
    this.notifications.update((notices) =>
      notices.map((item) =>
        item.id === id ? { ...item, closing: true } : item,
      ),
    );
    timers.removal = this.clock.schedule(() => this.remove(id), 180);
    this.timers.set(id, timers);
  }

  private remove(id: number): void {
    const timers = this.timers.get(id);
    if (timers?.expiry) this.clock.cancel(timers.expiry);
    if (timers?.removal) this.clock.cancel(timers.removal);
    this.timers.delete(id);
    this.notifications.update((notices) =>
      notices.filter((notice) => notice.id !== id),
    );
  }
}
