import assert from "node:assert/strict";
import test from "node:test";
import { createRealtimeDeduper, createRealtimeRefreshBatcher, serializeRealtimeCursor } from "./realtimeState";

test("realtime deduper accepts each event id once", () => {
  const deduper = createRealtimeDeduper(2);

  assert.equal(deduper.accept({ id: "evt-1" }), true);
  assert.equal(deduper.accept({ id: "evt-1" }), false);
  assert.equal(deduper.accept({ id: "evt-2" }), true);
  assert.equal(deduper.accept({ id: "evt-3" }), true);
  assert.equal(deduper.accept({ id: "evt-1" }), true);
});

test("realtime cursor serializes event id and timestamp", () => {
  const cursor = serializeRealtimeCursor({ id: "evt-123", ts: 1_717_171_717_171 });
  const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;

  assert.deepEqual(JSON.parse(Buffer.from(padded, "base64").toString("utf8")), {
    ts: 1_717_171_717_171,
    id: "evt-123",
  });
});

test("realtime refresh batcher coalesces multiple schedules", () => {
  const callbacks: Array<() => void> = [];
  let calls = 0;
  const batcher = createRealtimeRefreshBatcher({
    refresh: () => {
      calls += 1;
    },
    setTimer: (callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length as never;
    },
    clearTimer: () => undefined,
  });

  batcher.schedule();
  batcher.schedule();
  assert.equal(callbacks.length, 1);

  callbacks[0]?.();
  assert.equal(calls, 1);
});

test("realtime refresh batcher catches async refresh errors", async () => {
  const callbacks: Array<() => void> = [];
  const errors: unknown[] = [];
  const batcher = createRealtimeRefreshBatcher({
    refresh: async () => {
      throw new Error("Not found");
    },
    onError: (error) => {
      errors.push(error);
    },
    setTimer: (callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length as never;
    },
    clearTimer: () => undefined,
  });

  batcher.schedule();
  callbacks[0]?.();
  await Promise.resolve();
  assert.equal(errors.length, 1);
});
