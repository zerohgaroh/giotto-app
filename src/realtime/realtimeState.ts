import type { RealtimeEvent } from "../types/domain";

type TimerHandle = ReturnType<typeof setTimeout> | number;

export const STAFF_REALTIME_EVENT_NAMES: RealtimeEvent["type"][] = [
  "waiter:called",
  "bill:requested",
  "waiter:acknowledged",
  "waiter:done",
  "order:submitted_by_guest",
  "order:added_by_waiter",
  "review:submitted",
  "restaurant:updated",
  "task:created",
  "task:updated",
  "task:completed",
  "shift:summary_changed",
  "table:status_changed",
  "table:assignment_changed",
  "menu:changed",
  "table:created",
  "table:archived",
  "table:restored",
  "floor:layout_changed",
  "waiter:created",
  "waiter:updated",
  "waiter:deactivated",
  "waiter:password_reset",
];

export function serializeRealtimeCursor(event: Pick<RealtimeEvent, "id" | "ts">) {
  return btoa(JSON.stringify({ ts: event.ts, id: event.id }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createRealtimeDeduper(limit = 500) {
  const seen = new Set<string>();
  const order: string[] = [];

  return {
    accept(event: Pick<RealtimeEvent, "id">) {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      order.push(event.id);

      while (order.length > limit) {
        const stale = order.shift();
        if (stale) seen.delete(stale);
      }

      return true;
    },
    clear() {
      seen.clear();
      order.length = 0;
    },
  };
}

export function createRealtimeRefreshBatcher(input: {
  refresh: () => void | Promise<void>;
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}) {
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;
  const delayMs = input.delayMs ?? 350;
  let timer: TimerHandle | null = null;

  return {
    schedule() {
      if (timer) return;
      timer = setTimer(() => {
        timer = null;
        void input.refresh();
      }, delayMs);
    },
    cancel() {
      if (!timer) return;
      clearTimer(timer);
      timer = null;
    },
  };
}
