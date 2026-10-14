# UI Motion and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gentle UI feedback and a shared notification channel to the existing Angular chat.

**Architecture:** A testable notification store owns records and timers; an injectable Angular service exposes it to application code. A root component renders notices. `ChatStateService` publishes operation results, while focused CSS handles motion.

**Tech Stack:** Angular 20, TypeScript, CSS, Node.js 24 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-14-ui-motion-notifications-design.md`

## Global Constraints

- Keep the current conversation, draft, and streaming behavior.
- Add no dependency or backend endpoint.
- Auto-dismiss errors, warnings, and successes after 10 seconds; keep information and tips until dismissal.
- Show at most three notices, removing the oldest when a fourth arrives.
- Respect `prefers-reduced-motion: reduce`; do not animate streamed tokens.
- Keep Angular components non-standalone and register them in `AppModule`.
- Preserve unrelated changes and stage only files from the current task.
- Verify and commit the previous, uncommitted history-toggle/export-icon work separately before Task 2; do not fold it into notification commits.

## Review Focus

- A fourth notice must evict the oldest and cancel its timer: Task 1 test.
- A manually closed notice must not reappear when its timeout fires: Task 1 test.
- Information and tips must survive past 10 seconds: Task 1 test.
- A failed chat request must leave an explanation in the conversation without two visible error notices: Task 3 check.
- Keyboard and reduced-motion users must be able to dismiss notices and toggle history without moving focus: Tasks 2 and 4 checks.

---

### Task 1: Notification state and timer behavior

**Files:** Create `apps/web/src/app/services/notification-store.ts`, `apps/web/src/app/services/notification.service.ts`, `apps/web/test/notification-store.test.mjs`; modify `apps/web/package.json`.

**Interfaces:** Export `NotificationKind = "error" | "warning" | "success" | "info" | "tip"` and `NotificationRecord { id: number; kind: NotificationKind; message: string; closing: boolean }`. `NotificationStore` exposes `readonly notifications`, `show(kind: NotificationKind, message: string): number`, and `dismiss(id: number): void`; `NotificationService` extends it and is provided in root. Its optional constructor clock implements `schedule(callback, delayMs)` and `cancel(handle)`; the default uses browser timers.

- [ ] Write Node tests for 10-second expiry, persistent info/tips, a fourth notice evicting the oldest, unique IDs for repeated text, and manual dismissal canceling expiry. Assert the signal contents with a fake clock.
- [ ] Run `node --test apps/web/test/notification-store.test.mjs`; confirm failure because the store does not exist.
- [ ] Implement the store and service. Mark dismissed notices `closing` and remove them after 180 ms so CSS can animate exit; cancel both timers when evicting.
- [ ] Add `"test": "node --test test/*.test.mjs"` to the web workspace and run `npm run test --workspace @emil-ia/web`; expect zero failures.
- [ ] Commit only Task 1 files with `Add notification state and timer handling`.

### Task 2: Accessible notification center

**Files:** Create `apps/web/src/app/components/notification-center/notification-center.component.ts`, `.html`, `.css`; modify `apps/web/src/app/app.module.ts` and `apps/web/src/app/app.component.html`.

**Interfaces:** Inject `NotificationService`; render `notifications()` with a keyed loop. The close button calls `dismiss(id)`. Errors and warnings use `role="alert"`; other kinds use `role="status"`.

- [ ] Add the component with type icons, message text, and a labeled close button; mount it once in `AppComponent`.
- [ ] Add responsive placement and 180 ms opacity/transform entry and exit; disable spatial movement under reduced motion.
- [ ] Run web typecheck and build. Check keyboard dismissal, focus retention, and mobile width in a browser.
- [ ] Commit only Task 2 files with `Add accessible notification center`.

### Task 3: Publish real operation outcomes

**Files:** Modify `apps/web/src/app/services/chat-state.service.ts`, `apps/web/src/app/components/chat/chat.component.html`, and `apps/web/src/app/components/chat/chat.component.css`.

**Interfaces:** Inject `NotificationService` into `ChatStateService`. Use `show("error", message)` for failures and `show("success", message)` after export or feedback. Keep the failed-send explanation in the assistant message; remove the inline error banner.

- [ ] Connect load, selection, send, export, and feedback failures. Handle an SSE error once rather than publishing a duplicate from a later catch path.
- [ ] Publish success after completed export and saved feedback; do not publish a success for an operation that throws.
- [ ] Run web typecheck, tests, and build. Check failed send, failed export, successful export, and feedback in the app.
- [ ] Commit only Task 3 files with `Report chat outcomes through notifications`.

### Task 4: Soft interaction motion

**Files:** Modify `apps/web/src/app/app.component.css`, `apps/web/src/app/components/chat/chat.component.css`, and `apps/web/src/app/components/conversation-history/conversation-history.component.css`.

**Interfaces:** Keep the existing history-toggle state and chat service untouched. Use the `.history-collapsed` class already present in `AppComponent`.

- [ ] Use the `.agents/skills/animate/SKILL.md` motion decision framework before editing CSS. Add a short, interruptible history transition and subtle press feedback to existing controls; avoid animation on token updates and blanket `transition: all`.
- [ ] Add reduced-motion overrides and verify repeated toggle presses, keyboard focus, desktop and mobile layout.
- [ ] Run `npm run typecheck --workspace @emil-ia/web`, `npm run test --workspace @emil-ia/web`, `npm run build --workspace @emil-ia/web`, and `git diff --check`.
- [ ] Commit Task 4 files with `Add restrained UI motion`; do not stage unrelated files.
