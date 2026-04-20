import assert from "node:assert/strict";
import test from "node:test";
import type { WaiterTableDetailResponse, WaiterTask } from "../../types/domain";
import {
  canFinishWaiterTable,
  getVisibleWaiterTasks,
  waiterTaskBusinessStatus,
  waiterTaskTitle,
} from "./waiterBusiness";

function task(status: WaiterTask["status"], type: WaiterTask["type"] = "waiter_call"): WaiterTask {
  return {
    id: `${type}-${status}`,
    tableId: 1,
    tableSessionId: "session-1",
    type,
    priority: "urgent",
    status,
    title: "Task",
    createdAt: 100,
  };
}

test("getVisibleWaiterTasks keeps only active backend statuses", () => {
  const visible = getVisibleWaiterTasks([
    task("open"),
    task("acknowledged"),
    task("in_progress"),
    task("completed"),
    task("cancelled"),
  ]);

  assert.deepEqual(visible.map((item) => item.status), ["open", "acknowledged", "in_progress"]);
});

test("waiter task labels expose two-state business workflow", () => {
  assert.equal(waiterTaskBusinessStatus(task("open")), "Новое");
  assert.equal(waiterTaskBusinessStatus(task("completed")), "Выполнено");
  assert.equal(waiterTaskTitle(task("open", "guest_order")), "Новый заказ из корзины");
});

test("canFinishWaiterTable only allows active non-free sessions", () => {
  const base = {
    waiter: { id: "w-1", name: "Марко", login: "marco", active: true, tableIds: [1] },
    requests: [],
    tasks: [],
    billLines: [],
    total: 0,
    note: "",
    doneCooldownRemainingSec: 0,
    timeline: [],
  } satisfies Omit<WaiterTableDetailResponse, "table">;

  assert.equal(
    canFinishWaiterTable({
      ...base,
      table: { tableId: 1, status: "free", guestStartedAt: 100, hasActiveSession: false },
    }),
    false,
  );
  assert.equal(
    canFinishWaiterTable({
      ...base,
      table: { tableId: 1, status: "ordered", guestStartedAt: 100, hasActiveSession: true },
    }),
    true,
  );
});
