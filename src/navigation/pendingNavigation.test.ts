import assert from "node:assert/strict";
import test from "node:test";
import { createPendingTableNavigator } from "./pendingNavigation";

test("pending table navigation queues deep links until navigation is ready", () => {
  const visited: number[] = [];
  const navigator = createPendingTableNavigator((tableId) => {
    visited.push(tableId);
  });

  assert.equal(navigator.open(12, false), false);
  assert.equal(navigator.peek(), 12);
  assert.deepEqual(visited, []);

  assert.equal(navigator.flush(false), false);
  assert.deepEqual(visited, []);

  assert.equal(navigator.flush(true), true);
  assert.equal(navigator.peek(), null);
  assert.deepEqual(visited, [12]);
});

test("pending table navigation opens immediately when ready", () => {
  const visited: number[] = [];
  const navigator = createPendingTableNavigator((tableId) => {
    visited.push(tableId);
  });

  assert.equal(navigator.open(5, true), true);
  assert.equal(navigator.peek(), null);
  assert.deepEqual(visited, [5]);
});
