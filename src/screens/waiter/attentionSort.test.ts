import assert from "node:assert/strict";
import test from "node:test";
import type { WaiterTableSummary, WaiterTask } from "../../types/domain";
import { sortWaiterQueueTasks, sortWaiterTables } from "./attentionSort";

test("sortWaiterQueueTasks puts highlighted and newest urgent calls first", () => {
  const tasks: WaiterTask[] = [
    {
      id: "task-1",
      tableId: 5,
      tableSessionId: "session-1",
      type: "waiter_call",
      priority: "urgent",
      status: "open",
      title: "Older urgent",
      createdAt: 100,
    },
    {
      id: "task-2",
      tableId: 3,
      tableSessionId: "session-2",
      type: "bill_request",
      priority: "urgent",
      status: "open",
      title: "Newest urgent",
      createdAt: 200,
    },
    {
      id: "task-3",
      tableId: 9,
      tableSessionId: "session-3",
      type: "guest_order",
      priority: "urgent",
      status: "open",
      title: "Guest order",
      createdAt: 300,
    },
  ];

  assert.deepEqual(
    sortWaiterQueueTasks(tasks, 5).map((task) => task.id),
    ["task-1", "task-3", "task-2"],
  );

  assert.deepEqual(
    sortWaiterQueueTasks(tasks).map((task) => task.id),
    ["task-3", "task-2", "task-1"],
  );
});

test("sortWaiterTables puts the latest active request first", () => {
  const tables: WaiterTableSummary[] = [
    {
      tableId: 7,
      status: "occupied",
      guestStartedAt: 10,
      hasActiveSession: true,
      openTasksCount: 0,
      urgentTasksCount: 0,
    },
    {
      tableId: 2,
      status: "waiting",
      guestStartedAt: 20,
      hasActiveSession: true,
      openTasksCount: 1,
      urgentTasksCount: 1,
      activeRequest: {
        id: "request-1",
        tableId: 2,
        type: "waiter",
        reason: "Need help",
        createdAt: 100,
      },
    },
    {
      tableId: 4,
      status: "bill",
      guestStartedAt: 30,
      hasActiveSession: true,
      openTasksCount: 1,
      urgentTasksCount: 1,
      activeRequest: {
        id: "request-2",
        tableId: 4,
        type: "bill",
        reason: "Need bill",
        createdAt: 200,
      },
    },
    {
      tableId: 9,
      status: "ordered",
      guestStartedAt: 40,
      hasActiveSession: true,
      openTasksCount: 2,
      urgentTasksCount: 1,
    },
  ];

  assert.deepEqual(
    sortWaiterTables(tables).map((table) => table.tableId),
    [4, 2, 9, 7],
  );
});
