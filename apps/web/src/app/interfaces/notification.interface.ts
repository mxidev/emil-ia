export type NotificationKind = "error" | "warning" | "success" | "info" | "tip";

export interface NotificationRecord {
  id: number;
  kind: NotificationKind;
  message: string;
  closing: boolean;
}

export type NotificationTimerHandle = ReturnType<typeof setTimeout>;

export interface NotificationClock {
  schedule(callback: () => void, delayMs: number): NotificationTimerHandle;
  cancel(handle: NotificationTimerHandle): void;
}
