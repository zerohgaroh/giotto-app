import type { WaiterTableSummary, WaiterTask } from "../../types/domain";

export function sortWaiterQueueTasks(tasks: WaiterTask[], highlightTableId?: number) {
  return [...tasks].sort((left, right) => {
    const leftHighlighted = highlightTableId && left.tableId === highlightTableId ? 0 : 1;
    const rightHighlighted = highlightTableId && right.tableId === highlightTableId ? 0 : 1;
    if (leftHighlighted !== rightHighlighted) return leftHighlighted - rightHighlighted;

    const leftPriority = left.priority === "urgent" ? 0 : 1;
    const rightPriority = right.priority === "urgent" ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt;
    }

    return left.tableId - right.tableId;
  });
}

export function sortWaiterTables(tables: WaiterTableSummary[]) {
  return [...tables].sort((left, right) => {
    const leftHasRequest = left.activeRequest ? 0 : 1;
    const rightHasRequest = right.activeRequest ? 0 : 1;
    if (leftHasRequest !== rightHasRequest) return leftHasRequest - rightHasRequest;

    const requestTsDiff = (right.activeRequest?.createdAt ?? 0) - (left.activeRequest?.createdAt ?? 0);
    if (requestTsDiff !== 0) return requestTsDiff;

    const urgentDiff = right.urgentTasksCount - left.urgentTasksCount;
    if (urgentDiff !== 0) return urgentDiff;

    const openDiff = right.openTasksCount - left.openTasksCount;
    if (openDiff !== 0) return openDiff;

    return left.tableId - right.tableId;
  });
}
