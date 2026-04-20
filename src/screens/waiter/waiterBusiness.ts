import type { WaiterTableDetailResponse, WaiterTask } from "../../types/domain";

const ACTIVE_TASK_STATUSES = new Set(["open", "acknowledged", "in_progress"]);

export function isActiveWaiterTask(task: WaiterTask) {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

export function getVisibleWaiterTasks(tasks: WaiterTask[]) {
  return tasks.filter(isActiveWaiterTask);
}

export function waiterTaskTitle(task: WaiterTask) {
  if (task.type === "bill_request") return "Гости просят счёт";
  if (task.type === "guest_order") return "Новый заказ из корзины";
  if (task.type === "waiter_call") return "Гости вызывают официанта";
  return task.title || "Задача по столу";
}

export function waiterTaskSubtitle(task: WaiterTask) {
  if (task.type === "bill_request") return task.subtitle || "Принесите счёт гостям.";
  if (task.type === "guest_order") return task.subtitle || "Проверьте заказ и передайте его в работу.";
  if (task.type === "waiter_call") return task.subtitle || "Гости ждут официанта.";
  return task.subtitle || task.note || "";
}

export function waiterTaskTypeLabel(task: WaiterTask) {
  if (task.type === "bill_request") return "Счёт";
  if (task.type === "guest_order") return "Заказ";
  if (task.type === "waiter_call") return "Вызов";
  return "Задача";
}

export function waiterTaskBusinessStatus(task: WaiterTask) {
  return isActiveWaiterTask(task) ? "Новое" : "Выполнено";
}

export function canFinishWaiterTable(data: WaiterTableDetailResponse | null) {
  return !!data?.table.hasActiveSession && data.table.status !== "free";
}
