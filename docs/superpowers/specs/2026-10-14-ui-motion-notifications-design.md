# UI Motion and Notifications Design

## Goal and scope

Make the existing Angular chat feel responsive and give users one consistent place to see errors, warnings, successes, information, and tips. Keep the current conversation and streaming behavior. Add no dependency or backend endpoint.

## Notification flow

Create a root-provided `NotificationService` under `apps/web/src/app/services/`. It owns a signal of notification records with stable IDs, type, message, and dismissal policy. Callers publish through typed methods or one typed `show` method. The service removes error, warning, and success notifications after 10 seconds. Information and tips remain until the user closes them. Manual dismissal cancels the corresponding timer. Limit visible notices to three; remove the oldest when another arrives.

Create a non-standalone `NotificationCenterComponent` under `app/components/`, declare it in `AppModule`, and render it once in `AppComponent`. Place notices near the top-right on desktop and within the viewport on mobile. Each notice has a type-specific icon, readable text, and a close button. Use `role="alert"` for errors and warnings, and `role="status"` for success, information, and tips. Do not move keyboard focus when a notice appears.

Connect `ChatStateService` to the notification service. Report failures from conversation loading, selection, sending, export, and feedback. Show success after a completed export or saved feedback. Keep the assistant's explanatory text in a failed chat response, but remove the separate inline error banner to avoid duplicate alerts. Support warning, information, and tip messages through the shared service without adding an unsolicited tip on every visit.

## Motion

Use short CSS transitions for the history panel, notice entry and dismissal, and button press feedback. The history control must remain usable during a transition, and the chat must retain its draft and messages. Do not animate streamed tokens or each conversation item. Animate opacity and transform where practical; avoid broad `transition: all`. Under `prefers-reduced-motion: reduce`, show state changes without movement.

## Verification

Check notification timing and manual dismissal, including repeated notices. Check the history toggle and notices at desktop and mobile widths, keyboard focus, and reduced-motion behavior. Run the web typecheck and build plus `git diff --check`. The web workspace has no component-test runner today; do not add a test framework solely for this UI change.
