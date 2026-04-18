import assert from "node:assert/strict";
import test from "node:test";
import { shouldExitWaiterTableFlow } from "./waiterAccessGuard";

test("waiter table flow exits when table access is lost", () => {
  assert.equal(shouldExitWaiterTableFlow({ status: 403 }), true);
  assert.equal(shouldExitWaiterTableFlow({ status: 404 }), true);
});

test("waiter table flow keeps the current screen for other failures", () => {
  assert.equal(shouldExitWaiterTableFlow({ status: 400 }), false);
  assert.equal(shouldExitWaiterTableFlow({ status: 401 }), false);
  assert.equal(shouldExitWaiterTableFlow(new Error("boom")), false);
  assert.equal(shouldExitWaiterTableFlow(null), false);
});
