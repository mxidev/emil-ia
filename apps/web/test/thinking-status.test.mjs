import assert from "node:assert/strict";
import test from "node:test";
import {
  THINKING_MESSAGES,
  ThinkingStatusStore,
} from "../src/app/services/thinking-status.ts";

function createClock() {
  const timers = new Map();
  let nextId = 0;
  return {
    delays: [],
    setInterval(callback, delay) {
      const id = ++nextId;
      this.delays.push(delay);
      timers.set(id, callback);
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    tick() {
      for (const callback of timers.values()) callback();
    },
    activeTimers() {
      return timers.size;
    },
  };
}

test("starts with the first thinking message and rotates every 2200 ms", () => {
  const clock = createClock();
  const thinking = new ThinkingStatusStore(clock);

  assert.equal(thinking.message(), THINKING_MESSAGES[0]);
  assert.equal(thinking.cycle(), 0);

  thinking.start();

  assert.deepEqual(clock.delays, [2200]);
  clock.tick();
  assert.equal(thinking.cycle(), 1);
  assert.equal(thinking.message(), THINKING_MESSAGES[1]);
});

test("does not create duplicate timers when started more than once", () => {
  const clock = createClock();
  const thinking = new ThinkingStatusStore(clock);

  thinking.start();
  thinking.start();

  assert.equal(clock.activeTimers(), 1);
  assert.deepEqual(clock.delays, [2200]);
});

test("stopping cancels rotation and resets the next response", () => {
  const clock = createClock();
  const thinking = new ThinkingStatusStore(clock);

  thinking.start();
  clock.tick();
  thinking.stop();
  clock.tick();

  assert.equal(clock.activeTimers(), 0);
  assert.equal(thinking.cycle(), 0);
  assert.equal(thinking.message(), THINKING_MESSAGES[0]);
});
