import assert from "node:assert/strict";
import test from "node:test";
import { createMutationKey } from "./waiterDrafts";

test("mutation keys are prefixed and unique enough for retries", () => {
  const first = createMutationKey("task");
  const second = createMutationKey("task");

  assert.equal(first.startsWith("task-"), true);
  assert.equal(second.startsWith("task-"), true);
  assert.notEqual(first, second);
});
