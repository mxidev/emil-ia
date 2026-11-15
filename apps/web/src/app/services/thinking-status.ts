import { signal } from "@angular/core";

export const THINKING_MESSAGES = [
  "Procesando tu consulta…",
  "Pensando paso a paso…",
  "Ordenando ecuaciones y pistas…",
  "Consultando a las mentes maestras de las matemáticas…",
  "Revisando que todo tenga sentido…",
] as const;

export interface ThinkingClock {
  setInterval(callback: () => void, delay: number): unknown;
  clearInterval(handle: unknown): void;
}

const browserClock: ThinkingClock = {
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export class ThinkingStatusStore {
  readonly message = signal<string>(THINKING_MESSAGES[0]);
  readonly cycle = signal(0);
  private timer: unknown;

  constructor(private readonly clock: ThinkingClock = browserClock) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.message.set(THINKING_MESSAGES[0]);
    this.cycle.set(0);
    this.timer = this.clock.setInterval(() => this.advance(), 2200);
  }

  stop(): void {
    if (this.timer !== undefined) {
      this.clock.clearInterval(this.timer);
      this.timer = undefined;
    }
    this.message.set(THINKING_MESSAGES[0]);
    this.cycle.set(0);
  }

  private advance(): void {
    const nextCycle = (this.cycle() + 1) % THINKING_MESSAGES.length;
    this.cycle.set(nextCycle);
    this.message.set(THINKING_MESSAGES[nextCycle]);
  }
}
