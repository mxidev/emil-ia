import assert from "node:assert/strict";
import test from "node:test";
import { NotificationStore } from "../src/app/services/notification-store.ts";
import { shouldMoveFocusIntoNotificationCenter } from "../src/app/components/notification-center/notification-center.component.ts";

class FakeClock {
  now = 0;
  nextId = 1;
  jobs = new Map();

  schedule = (callback, delayMs) => {
    const id = this.nextId++;
    this.jobs.set(id, { at: this.now + delayMs, callback });
    return id;
  };

  cancel = (id) => {
    this.jobs.delete(id);
  };

  advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.now = next[1].at;
      this.jobs.delete(next[0]);
      next[1].callback();
    }
    this.now = end;
  }
}

test("error, warning and success notices expire after ten seconds", () => {
  const clock = new FakeClock();
  const store = new NotificationStore(clock);
  for (const kind of ["error", "warning", "success"])
    store.show(kind, kind);

  clock.advance(9_999);
  assert.equal(store.notifications().length, 3);
  clock.advance(1);
  assert.ok(store.notifications().every((notice) => notice.closing));
  clock.advance(180);
  assert.deepEqual(store.notifications(), []);
});

test("information and tips remain until dismissed", () => {
  const clock = new FakeClock();
  const store = new NotificationStore(clock);
  store.show("info", "Información");
  store.show("tip", "Consejo");

  clock.advance(60_000);
  assert.deepEqual(
    store.notifications().map((notice) => notice.kind),
    ["info", "tip"],
  );
  assert.equal(clock.jobs.size, 0);
});

test("a fourth notice evicts the oldest and cancels its timer", () => {
  const clock = new FakeClock();
  const store = new NotificationStore(clock);
  const firstId = store.show("error", "Primero");
  store.show("warning", "Segundo");
  store.show("success", "Tercero");
  store.show("info", "Cuarto");

  assert.equal(store.notifications().length, 3);
  assert.ok(!store.notifications().some((notice) => notice.id === firstId));
  assert.equal(clock.jobs.size, 2);
});

test("repeated text receives distinct stable IDs", () => {
  const store = new NotificationStore(new FakeClock());
  const firstId = store.show("tip", "Mismo texto");
  const secondId = store.show("tip", "Mismo texto");

  assert.notEqual(firstId, secondId);
  assert.deepEqual(
    store.notifications().map((notice) => notice.id),
    [firstId, secondId],
  );
});

test("manual dismissal cancels expiry and completes exit once", () => {
  const clock = new FakeClock();
  const store = new NotificationStore(clock);
  const id = store.show("error", "Fallo");

  store.dismiss(id);
  store.dismiss(id);
  assert.equal(store.notifications()[0].closing, true);
  assert.equal(clock.jobs.size, 1);
  clock.advance(180);
  assert.deepEqual(store.notifications(), []);
  clock.advance(10_000);
  assert.deepEqual(store.notifications(), []);
});

test("focus returns to the center when its focused notice starts closing", () => {
  assert.equal(shouldMoveFocusIntoNotificationCenter(7, [7]), true);
  assert.equal(shouldMoveFocusIntoNotificationCenter(7, [8]), false);
  assert.equal(shouldMoveFocusIntoNotificationCenter(null, [7]), false);
});
